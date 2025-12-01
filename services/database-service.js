const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();

class DatabaseService {
  // create user
  async createUser(user) {
    return await prisma.user.create({
      data: user,
    });
  }

  // check if user exists
  async checkUserExists(username, email) {
    return await prisma.user.findUnique({
      where: {
        username: username,
        email: email,
      },
    });
  }

  // find user
  async findUser(username) {
    return await prisma.user.findUnique({
      where: {
        username: username,
      },
    });
  }

  // find user by id
  async findUserById(userId) {
    return await prisma.user.findUnique({
      where: {
        user_id: userId,
      },
    });
  }

  // create event (with optional recurrence)
  async createEvent(event) {
    const { recurrence, ...eventData } = event;

    if (recurrence) {
      // Create event with recurrence
      return await prisma.event.create({
        data: {
          ...eventData,
          recurrence: {
            create: recurrence,
          },
        },
        include: {
          recurrence: true,
        },
      });
    } else {
      // Create event without recurrence
      return await prisma.event.create({
        data: eventData,
      });
    }
  }

  // find event (excludes deleted events)
  async findEvent(eventId) {
    return await prisma.event.findFirst({
      where: {
        event_id: eventId,
        deleted_at: null,
      },
      include: {
        recurrence: true,
      },
    });
  }

  // find event including deleted ones (for verification purposes)
  async findEventIncludingDeleted(eventId) {
    return await prisma.event.findUnique({
      where: {
        event_id: eventId,
      },
    });
  }

  // update event
  async updateEvent(eventId, eventData) {
    // Separate recurrence from event data
    const { recurrence, ...eventUpdateData } = eventData;

    // Start a transaction to update event and recurrence
    return await prisma.$transaction(async (tx) => {
      // Delete existing recurrence if it exists (deleteMany won't error if none exists)
      await tx.recurrence.deleteMany({
        where: {
          event_id: eventId,
        },
      });

      // Update the event
      await tx.event.update({
        where: {
          event_id: eventId,
        },
        data: eventUpdateData,
      });

      // Create new recurrence if provided
      if (recurrence) {
        await tx.recurrence.create({
          data: {
            event_id: eventId,
            pattern: recurrence.pattern,
            start_at: recurrence.start_at,
            end_at: recurrence.end_at,
            weekdays: recurrence.weekdays || [],
            monthDays: recurrence.monthDays || [],
          },
        });
      }

      // Fetch the updated event with recurrence
      return await tx.event.findUnique({
        where: {
          event_id: eventId,
        },
        include: {
          recurrence: true,
        },
      });
    });
  }

  // soft delete event (marks as deleted instead of actually deleting)
  async deleteEvent(eventId) {
    return await prisma.event.update({
      where: {
        event_id: eventId,
      },
      data: {
        deleted_at: new Date(),
      },
    });
  }

  // restore event (undelete)
  async restoreEvent(eventId) {
    const event = await prisma.event.findUnique({
      where: {
        event_id: eventId,
      },
    });

    if (!event) {
      throw new Error("Event not found");
    }

    if (!event.deleted_at) {
      throw new Error("Event is not deleted");
    }

    // Check if event was deleted more than 30 days ago
    const deletedDate = new Date(event.deleted_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (deletedDate < thirtyDaysAgo) {
      throw new Error("Cannot restore event deleted more than 30 days ago");
    }

    return await prisma.event.update({
      where: {
        event_id: eventId,
      },
      data: {
        deleted_at: null,
      },
    });
  }

  // hard delete event (permanently remove from database)
  // Should only be used for events deleted more than 30 days ago
  async hardDeleteEvent(eventId) {
    const event = await prisma.event.findUnique({
      where: {
        event_id: eventId,
      },
    });

    if (!event) {
      throw new Error("Event not found");
    }

    if (!event.deleted_at) {
      throw new Error("Event is not deleted");
    }

    // Check if event was deleted more than 30 days ago
    const deletedDate = new Date(event.deleted_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (deletedDate >= thirtyDaysAgo) {
      throw new Error(
        "Cannot permanently delete event deleted less than 30 days ago"
      );
    }

    return await prisma.event.delete({
      where: {
        event_id: eventId,
      },
    });
  }

  // find deleted events for a user
  async findDeletedEvents(userId) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: {
          not: null,
        },
      },
      orderBy: {
        deleted_at: "desc",
      },
    });
  }
  // find events by user id (excludes deleted events)
  // Expands recurring events into individual occurrences
  // Also includes events where user has accepted invites
  async findEventsByUserId(userId) {
    const now = new Date();
    const futureEnd = new Date(now);
    futureEnd.setFullYear(futureEnd.getFullYear() + 2); // Look ahead 2 years for recurring events

    // Get all events created by user (including recurring ones that might generate future occurrences)
    const userEvents = await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        OR: [
          // Regular events in the future
          {
            start_at: {
              gte: now,
            },
            recurrence: null,
          },
          // Recurring events
          {
            recurrence: {
              isNot: null,
            },
          },
        ],
      },
      include: {
        recurrence: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // Get events where user has accepted invites
    const acceptedInvites = await prisma.eventInvite.findMany({
      where: {
        invited_user_id: userId,
        status: "ACCEPTED",
      },
      include: {
        event: {
          include: {
            recurrence: true,
          },
        },
      },
    });

    const invitedEvents = acceptedInvites
      .map((invite) => invite.event)
      .filter((event) => event.deleted_at === null);

    // Combine user events and invited events
    const allEvents = [...userEvents, ...invitedEvents];

    // Expand recurring events and filter to future occurrences
    const expandedEvents = [];
    for (const event of allEvents) {
      if (event.recurrence) {
        const occurrences = this.expandRecurringEvent(event, now, futureEnd);
        expandedEvents.push(...occurrences);
      } else {
        expandedEvents.push(event);
      }
    }

    return expandedEvents;
  }
  // find events by user id and date (excludes deleted events)
  async findEventsByUserIdAndDate(userId, date) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        start_at: {
          gte: date,
        },
      },
    });
  }

  // find events by user id and date range (excludes deleted events)
  // Expands recurring events into individual occurrences
  // Also includes events where user has accepted invites
  async findEventsByUserIdAndDateRange(userId, startDate, endDate) {
    // Get all events created by user (including those with recurrence that start before the range)
    const userEvents = await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        OR: [
          // Regular events within date range
          {
            start_at: {
              gte: startDate,
              lt: endDate,
            },
            recurrence: null, // Non-recurring events
          },
          // Recurring events that might generate occurrences in the range
          {
            recurrence: {
              isNot: null,
            },
          },
        ],
      },
      include: {
        recurrence: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // Get events where user has accepted invites
    const acceptedInvites = await prisma.eventInvite.findMany({
      where: {
        invited_user_id: userId,
        status: "ACCEPTED",
      },
      include: {
        event: {
          include: {
            recurrence: true,
          },
        },
      },
    });

    const invitedEvents = acceptedInvites
      .map((invite) => invite.event)
      .filter((event) => event.deleted_at === null);

    // Combine user events and invited events
    const allEvents = [...userEvents, ...invitedEvents];

    // Expand recurring events and filter to date range
    const expandedEvents = [];
    for (const event of allEvents) {
      if (event.recurrence) {
        // Expand recurring event
        const occurrences = this.expandRecurringEvent(
          event,
          startDate,
          endDate
        );
        expandedEvents.push(...occurrences);
      } else {
        // Regular event, add as-is
        expandedEvents.push(event);
      }
    }

    return expandedEvents;
  }

  // find today's events for a user (excludes deleted events)
  async findTodaysEvents(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        start_at: {
          gte: today,
          lt: tomorrow,
        },
      },
      orderBy: {
        start_at: "desc", // Most recent first
      },
    });
  }

  // find upcoming events for a user (excludes deleted events)
  async findUpcomingEvents(userId) {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        start_at: {
          gte: tomorrow,
        },
      },
      orderBy: {
        start_at: "asc", // Chronological order
      },
    });
  }

  // find past events for a user (excludes deleted events)
  async findPastEvents(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        end_at: {
          lt: today,
        },
      },
      orderBy: {
        end_at: "desc", // Most recent first
      },
    });
  }

  // add friend
  async addFriend(userId, friendId) {
    return await prisma.friend.create({
      data: {
        user_id1: userId,
        user_id2: friendId,
        status: "ACCEPTED",
        since: new Date(),
      },
    });
  }

  // get friends (with user details included)
  async getFriends(userId) {
    return await prisma.friend.findMany({
      where: {
        OR: [{ user_id1: userId }, { user_id2: userId }],
      },
      include: {
        user1: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
        user2: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
    });
  }

  // get friend requests (pending requests received by user, with user details)
  async getFriendRequests(userId) {
    return await prisma.friend.findMany({
      where: {
        user_id2: userId,
        status: "PENDING",
      },
      include: {
        user1: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
    });
  }

  // send friend request
  async sendFriendRequest(userId, friendId) {
    return await prisma.friend.create({
      data: {
        user_id1: userId,
        user_id2: friendId,
      },
    });
  }

  // create friend request (with validation and duplicate checking)
  async createFriendRequest(userId1, userId2) {
    // Prevent self-friending
    if (userId1 === userId2) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Check if relationship already exists
    const existingRelationship = await this.findFriendRelationship(
      userId1,
      userId2
    );
    if (existingRelationship) {
      throw new Error("Friend relationship already exists");
    }

    // Validate both users exist
    const user1 = await this.findUserById(userId1);
    const user2 = await this.findUserById(userId2);

    if (!user1) {
      throw new Error("User not found");
    }
    if (!user2) {
      throw new Error("Friend user not found");
    }

    // Create friend request with PENDING status
    return await prisma.friend.create({
      data: {
        user_id1: userId1,
        user_id2: userId2,
        status: "PENDING",
      },
    });
  }

  // accept friend request (with validation)
  // currentUserId: the user accepting the request
  // requesterId: the user who sent the friend request
  async acceptFriendRequest(currentUserId, requesterId) {
    // Find the relationship (handles both orderings)
    const relationship = await this.findFriendRelationship(
      currentUserId,
      requesterId
    );

    if (!relationship) {
      throw new Error("Friend relationship not found");
    }

    // Verify the request is PENDING
    if (relationship.status !== "PENDING") {
      throw new Error(
        `Cannot accept friend request. Current status: ${relationship.status}`
      );
    }

    // Verify the current user is the one receiving the request
    // In a friend request: user_id1 is the sender, user_id2 is the receiver
    // The current user (accepting) should be user_id2
    const isReceiver =
      relationship.user_id1 === requesterId &&
      relationship.user_id2 === currentUserId;

    if (!isReceiver) {
      throw new Error("You are not authorized to accept this friend request");
    }

    // Update status to ACCEPTED using composite key
    return await prisma.friend.update({
      where: {
        user_id1_user_id2: {
          user_id1: relationship.user_id1,
          user_id2: relationship.user_id2,
        },
      },
      data: {
        status: "ACCEPTED",
      },
    });
  }

  // reject friend request (deletes the relationship)
  async rejectFriendRequest(userId1, userId2) {
    const relationship = await this.findFriendRelationship(userId1, userId2);

    if (!relationship) {
      throw new Error("Friend relationship not found");
    }

    // Delete the pending request using composite key
    return await prisma.friend.delete({
      where: {
        user_id1_user_id2: {
          user_id1: relationship.user_id1,
          user_id2: relationship.user_id2,
        },
      },
    });
  }

  // delete friend (removes friendship, handles bidirectional relationships)
  async deleteFriend(userId1, userId2) {
    const relationship = await this.findFriendRelationship(userId1, userId2);

    if (!relationship) {
      throw new Error("Friend relationship not found");
    }

    // Delete using the actual relationship order from database with composite key
    return await prisma.friend.delete({
      where: {
        user_id1_user_id2: {
          user_id1: relationship.user_id1,
          user_id2: relationship.user_id2,
        },
      },
    });
  }

  // find friend relationship between two users (handles both orderings)
  async findFriendRelationship(userId1, userId2) {
    // Check both possible orderings since Friend table has composite key (user_id1, user_id2)
    const relationship = await prisma.friend.findFirst({
      where: {
        OR: [
          { user_id1: userId1, user_id2: userId2 },
          { user_id1: userId2, user_id2: userId1 },
        ],
      },
    });

    return relationship;
  }

  // find events by friend ids (multiple friends, with optional date range, excludes deleted events)
  async findEventsByFriendIds(friendIds, startDate, endDate) {
    // Build where clause
    const whereClause = {
      user_id: {
        in: friendIds,
      },
      deleted_at: null, // Exclude deleted events
    };

    // Add date range filtering if provided
    if (startDate && endDate) {
      whereClause.start_at = {
        gte: startDate,
        lt: endDate,
      };
    } else if (startDate) {
      whereClause.start_at = {
        gte: startDate,
      };
    }

    return await prisma.event.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
      orderBy: {
        start_at: "asc",
      },
    });
  }

  // find availability for friends (calculate free/busy times)
  async findAvailabilityForFriends(friendIds, startDate, endDate) {
    // Get all events for the friends
    const events = await this.findEventsByFriendIds(
      friendIds,
      startDate,
      endDate
    );

    // Process events into busy time blocks
    const busyTimes = events.map((event) => ({
      start: event.start_at,
      end: event.end_at,
      friendId: event.user_id,
      friendName: event.user.username,
      eventTitle: event.title,
      eventId: event.event_id,
    }));

    // Calculate free time blocks (inverse of busy times)
    const freeTimes = this.calculateFreeTimes(
      busyTimes,
      startDate || new Date(),
      endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default to 30 days if not provided
    );

    return {
      busyTimes: busyTimes,
      freeTimes: freeTimes,
    };
  }

  // Helper method to calculate free time blocks from busy times
  calculateFreeTimes(busyTimes, startDate, endDate) {
    if (busyTimes.length === 0) {
      // If no busy times, the entire range is free
      return [
        {
          start: startDate,
          end: endDate,
        },
      ];
    }

    // Sort busy times by start date
    const sortedBusyTimes = [...busyTimes].sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );

    const freeTimes = [];
    let currentTime = new Date(startDate);

    for (const busyBlock of sortedBusyTimes) {
      const busyStart = new Date(busyBlock.start);
      const busyEnd = new Date(busyBlock.end);

      // If there's a gap before this busy block, it's free time
      if (currentTime < busyStart) {
        freeTimes.push({
          start: new Date(currentTime),
          end: new Date(busyStart),
        });
      }

      // Update current time to the end of this busy block
      if (busyEnd > currentTime) {
        currentTime = busyEnd;
      }
    }

    // Check if there's free time after the last busy block
    if (currentTime < endDate) {
      freeTimes.push({
        start: new Date(currentTime),
        end: new Date(endDate),
      });
    }

    return freeTimes;
  }

  // Create event invite
  async createEventInvite(eventId, invitedUserId, invitedById) {
    // Check if invite already exists
    const existingInvite = await prisma.eventInvite.findUnique({
      where: {
        event_id_invited_user_id: {
          event_id: eventId,
          invited_user_id: invitedUserId,
        },
      },
    });

    if (existingInvite) {
      throw new Error("Invite already exists for this event and user");
    }

    return await prisma.eventInvite.create({
      data: {
        event_id: eventId,
        invited_user_id: invitedUserId,
        invited_by_id: invitedById,
        status: "PENDING",
      },
      include: {
        event: true,
        invitedUser: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
        invitedBy: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
    });
  }

  // Create multiple event invites
  async createEventInvites(eventId, invitedUserIds, invitedById) {
    const invites = [];
    for (const userId of invitedUserIds) {
      try {
        const invite = await this.createEventInvite(
          eventId,
          userId,
          invitedById
        );
        invites.push(invite);
      } catch (error) {
        // Skip if invite already exists
        if (error.message !== "Invite already exists for this event and user") {
          throw error;
        }
      }
    }
    return invites;
  }

  // Get event invites for a user (received invites)
  async getEventInvitesForUser(userId, status = null) {
    const whereClause = {
      invited_user_id: userId,
    };

    if (status) {
      whereClause.status = status;
    }

    return await prisma.eventInvite.findMany({
      where: whereClause,
      include: {
        event: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                email: true,
                profile_image_url: true,
              },
            },
          },
        },
        invitedBy: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
      orderBy: {
        sent_at: "desc",
      },
    });
  }

  // Get pending event invites count for a user
  async getPendingEventInvitesCount(userId) {
    return await prisma.eventInvite.count({
      where: {
        invited_user_id: userId,
        status: "PENDING",
      },
    });
  }

  // Update event invite status (accept/decline)
  // Allows changing from PENDING to ACCEPTED/DECLINED
  // Also allows changing from ACCEPTED to DECLINED (rejecting after accepting)
  async updateEventInviteStatus(inviteId, userId, status) {
    // Verify the invite belongs to the user
    const invite = await prisma.eventInvite.findUnique({
      where: {
        invite_id: inviteId,
      },
    });

    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.invited_user_id !== userId) {
      throw new Error("You are not authorized to update this invite");
    }

    // Allow status changes:
    // - PENDING -> ACCEPTED or DECLINED
    // - ACCEPTED -> DECLINED (rejecting after accepting)
    if (invite.status === "PENDING") {
      // Can change from PENDING to ACCEPTED or DECLINED
      if (status !== "ACCEPTED" && status !== "DECLINED") {
        throw new Error("Invalid status change from PENDING");
      }
    } else if (invite.status === "ACCEPTED") {
      // Can only change from ACCEPTED to DECLINED (reject)
      if (status !== "DECLINED") {
        throw new Error("Can only reject an accepted invite");
      }
    } else {
      // DECLINED or CANCELLED invites cannot be changed
      throw new Error(
        "Invite has already been responded to and cannot be changed"
      );
    }

    return await prisma.eventInvite.update({
      where: {
        invite_id: inviteId,
      },
      data: {
        status: status,
        responded_at: new Date(),
      },
      include: {
        event: true,
        invitedBy: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
    });
  }

  // Get invites for an event
  async getEventInvites(eventId) {
    return await prisma.eventInvite.findMany({
      where: {
        event_id: eventId,
      },
      include: {
        invitedUser: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
        invitedBy: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
      orderBy: {
        sent_at: "desc",
      },
    });
  }

  // Get invite for a specific user and event
  async getUserEventInvite(userId, eventId) {
    return await prisma.eventInvite.findUnique({
      where: {
        event_id_invited_user_id: {
          event_id: eventId,
          invited_user_id: userId,
        },
      },
      include: {
        event: {
          select: {
            event_id: true,
            user_id: true,
            title: true,
            description: true,
            start_at: true,
            end_at: true,
          },
        },
        invitedBy: {
          select: {
            user_id: true,
            username: true,
            email: true,
            profile_image_url: true,
          },
        },
      },
    });
  }

  // Helper method to expand a recurring event into individual occurrences
  expandRecurringEvent(event, startDate, endDate) {
    const { recurrence } = event;
    if (!recurrence) return [];

    const occurrences = [];
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    const duration = eventEnd.getTime() - eventStart.getTime(); // Duration in milliseconds

    // Determine the effective start date (max of event start and requested start)
    const effectiveStart = new Date(
      Math.max(eventStart.getTime(), startDate.getTime())
    );
    const recurrenceEnd = recurrence.end_at
      ? new Date(recurrence.end_at)
      : null;
    const finalEnd =
      recurrenceEnd && recurrenceEnd < endDate ? recurrenceEnd : endDate;

    // Map weekday enum to JavaScript day numbers (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const weekdayMap = {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
    };

    if (recurrence.pattern === "DAILY") {
      // Every day
      let currentDate = new Date(effectiveStart);
      currentDate.setHours(
        eventStart.getHours(),
        eventStart.getMinutes(),
        eventStart.getSeconds(),
        0
      );

      while (currentDate <= finalEnd) {
        if (currentDate >= startDate) {
          const occurrenceEnd = new Date(currentDate.getTime() + duration);
          occurrences.push({
            ...event,
            start_at: new Date(currentDate),
            end_at: occurrenceEnd,
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else if (
      recurrence.pattern === "WEEKLY" &&
      recurrence.weekdays &&
      recurrence.weekdays.length > 0
    ) {
      // Same day(s) every week
      let currentDate = new Date(effectiveStart);
      currentDate.setHours(
        eventStart.getHours(),
        eventStart.getMinutes(),
        eventStart.getSeconds(),
        0
      );

      // Convert weekday enums to day numbers
      const targetDays = recurrence.weekdays.map((wd) => weekdayMap[wd]);

      // Start from the beginning of the week containing effectiveStart
      const dayOfWeek = currentDate.getDay();
      currentDate.setDate(currentDate.getDate() - dayOfWeek); // Go to Sunday of that week

      // Generate occurrences for up to 2 years (104 weeks) or until finalEnd
      const maxIterations = 104;
      let iterations = 0;

      while (currentDate <= finalEnd && iterations < maxIterations) {
        for (const targetDay of targetDays) {
          const occurrenceDate = new Date(currentDate);
          occurrenceDate.setDate(occurrenceDate.getDate() + targetDay);
          occurrenceDate.setHours(
            eventStart.getHours(),
            eventStart.getMinutes(),
            eventStart.getSeconds(),
            0
          );

          if (occurrenceDate >= startDate && occurrenceDate <= finalEnd) {
            const occurrenceEnd = new Date(occurrenceDate.getTime() + duration);
            occurrences.push({
              ...event,
              start_at: new Date(occurrenceDate),
              end_at: occurrenceEnd,
            });
          }
        }
        currentDate.setDate(currentDate.getDate() + 7); // Move to next week
        iterations++;
      }
    } else if (
      recurrence.pattern === "MONTHLY" &&
      recurrence.monthDays &&
      recurrence.monthDays.length > 0
    ) {
      // Same day(s) every month
      let currentDate = new Date(effectiveStart);
      currentDate.setDate(1); // Start from first day of month
      currentDate.setHours(
        eventStart.getHours(),
        eventStart.getMinutes(),
        eventStart.getSeconds(),
        0
      );

      // Generate occurrences for up to 2 years (24 months) or until finalEnd
      const maxIterations = 24;
      let iterations = 0;

      while (currentDate <= finalEnd && iterations < maxIterations) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        for (const dayOfMonth of recurrence.monthDays) {
          // Check if the day exists in this month (e.g., Feb 30 doesn't exist)
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          if (dayOfMonth <= daysInMonth) {
            const occurrenceDate = new Date(year, month, dayOfMonth);
            occurrenceDate.setHours(
              eventStart.getHours(),
              eventStart.getMinutes(),
              eventStart.getSeconds(),
              0
            );

            if (occurrenceDate >= startDate && occurrenceDate <= finalEnd) {
              const occurrenceEnd = new Date(
                occurrenceDate.getTime() + duration
              );
              occurrences.push({
                ...event,
                start_at: new Date(occurrenceDate),
                end_at: occurrenceEnd,
              });
            }
          }
        }

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
        iterations++;
      }
    }

    // Sort by start date
    occurrences.sort((a, b) => a.start_at.getTime() - b.start_at.getTime());

    return occurrences;
  }
}

module.exports = new DatabaseService();
