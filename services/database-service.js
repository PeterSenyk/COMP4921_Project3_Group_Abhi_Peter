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

  // create event
  async createEvent(event) {
    return await prisma.event.create({
      data: event,
    });
  }

  // find event (excludes deleted events)
  async findEvent(eventId) {
    return await prisma.event.findFirst({
      where: {
        event_id: eventId,
        deleted_at: null,
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
  async updateEvent(eventId, event) {
    return await prisma.event.update({
      where: {
        event_id: eventId,
      },
      data: event,
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
  async findEventsByUserId(userId) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        start_at: {
          gte: new Date(),
        },
      },
    });
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
  async findEventsByUserIdAndDateRange(userId, startDate, endDate) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        start_at: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: {
        start_at: "asc",
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
}

module.exports = new DatabaseService();
