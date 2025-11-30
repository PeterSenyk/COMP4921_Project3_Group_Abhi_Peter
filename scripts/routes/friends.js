const databaseService = require("../../services/database-service");
const { getUserFromSession, isAuthenticated } = require("../../utils/auth");
const names = require("../../api/names.json");

module.exports = (app) => {
  app.get("/friends", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      let friends = await databaseService.getFriends(user.user_id);
    //   console.log("Friends: ", friends);

      let friendListfinal = [];

      if (friends.length === 0) {
        friendListfinal = [{ username: "No friends found" }];
      } else {
        // User details are already included from getFriends, no need for additional queries
        friendListfinal = friends
          .map((friend) => {
            // Determine which user is the "other" friend (not the current user)
            const otherFriend =
              friend.user_id1 === user.user_id ? friend.user2 : friend.user1;

            if (!otherFriend) {
              return null;
            }

            // Check if current user is the receiver (user_id2) of the friend request
            const isReceiver = friend.user_id2 === user.user_id;

            return {
              username: otherFriend.username,
              user_id: otherFriend.user_id,
              status: friend.status,
              since:
                friend.since.getDate() +
                "/" +
                names.monthNamesShort[friend.since.getMonth()] +
                "/" +
                friend.since.getFullYear(),
              isReceiver: isReceiver, // Only receiver can accept pending requests
            };
          })
          .filter((friend) => friend !== null);
      }

    //   console.log("FriendListFinal: ", friendListfinal);

      res.render("friends", {
        title: "Friends",
        friends: friendListfinal,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/friends/add/", isAuthenticated, async (req, res) => {
    try {
      const { friend_ID } = req.body;
      const user = getUserFromSession(req);

      // Parse friend_ID to integer (form data comes as string)
      const friendId = parseInt(friend_ID);
      if (!friendId || isNaN(friendId)) {
        return res.status(400).send("Invalid friend ID");
      }

      const friendToAdd = await databaseService.findUserById(friendId);
      if (!friendToAdd) {
        return res.status(404).send("Friend to add not found");
      }
      const friendRequest = await databaseService.sendFriendRequest(
        user.user_id,
        friendToAdd.user_id
      );
      if (!friendRequest) {
        return res.status(500).send("Failed to send friend request");
      }
      return res.redirect("/friends");
    } catch (error) {
      console.error(error);
      res.status(500).send("Failed to add friend");
    }
  });

  // Remove/delete friend route
  app.post("/friends/remove/:friendId", isAuthenticated, async (req, res) => {
    try {
      const friendId = parseInt(req.params.friendId);
      const user = getUserFromSession(req);

      if (!friendId || isNaN(friendId)) {
        return res.status(400).json({ error: "Invalid friend ID" });
      }

      // Delete the friendship (handles bidirectional relationships)
      await databaseService.deleteFriend(user.user_id, friendId);

      // Redirect back to friends page
      return res.redirect("/friends");
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).send("Failed to remove friend");
    }
  });

  // API endpoint: Get all friends for current user (JSON)
  app.get("/api/friends", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get all friends with user details
      const friends = await databaseService.getFriends(user.user_id);

      // Transform to include only the "other" friend's details
      const friendsList = friends
        .map((friend) => {
          // Determine which user is the "other" friend (not the current user)
          const otherFriend =
            friend.user_id1 === user.user_id ? friend.user2 : friend.user1;

          if (!otherFriend) {
            return null;
          }

          return {
            user_id: otherFriend.user_id,
            username: otherFriend.username,
            email: otherFriend.email,
            profile_image_url: otherFriend.profile_image_url,
            status: friend.status,
            since: friend.since,
          };
        })
        .filter((friend) => friend !== null);

      res.json(friendsList);
    } catch (error) {
      console.error("Error fetching friends:", error);
      res.status(500).json({ error: "Failed to fetch friends" });
    }
  });

  // API endpoint: Get pending friend requests (JSON)
  app.get("/api/friends/pending", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get pending friend requests (where current user is the receiver)
      const pendingRequests = await databaseService.getFriendRequests(
        user.user_id
      );

      // Transform to include sender's details
      const requestsList = pendingRequests.map((request) => {
        // user_id1 is the sender (the one who sent the request)
        return {
          user_id: request.user1.user_id,
          username: request.user1.username,
          email: request.user1.email,
          profile_image_url: request.user1.profile_image_url,
          status: request.status,
          sent_at: request.since, // since field represents when the request was sent
        };
      });

      res.json(requestsList);
    } catch (error) {
      console.error("Error fetching pending friend requests:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch pending friend requests" });
    }
  });

  // API endpoint: Send friend request (JSON)
  app.post("/api/friends/request", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { friendId, username } = req.body;

      // Validate that either friendId or username is provided
      if (!friendId && !username) {
        return res
          .status(400)
          .json({ error: "Either friendId or username is required" });
      }

      let friendToAdd;

      // Find friend by ID or username
      if (friendId) {
        friendToAdd = await databaseService.findUserById(parseInt(friendId));
      } else if (username) {
        friendToAdd = await databaseService.findUser(username);
      }

      if (!friendToAdd) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent self-friending
      if (friendToAdd.user_id === user.user_id) {
        return res
          .status(400)
          .json({ error: "Cannot send friend request to yourself" });
      }

      // Create friend request (includes validation for duplicates)
      try {
        const friendRequest = await databaseService.createFriendRequest(
          user.user_id,
          friendToAdd.user_id
        );

        res.status(201).json({
          success: true,
          message: "Friend request sent successfully",
          friendRequest: {
            user_id1: friendRequest.user_id1,
            user_id2: friendRequest.user_id2,
            status: friendRequest.status,
            since: friendRequest.since,
          },
        });
      } catch (error) {
        // Handle validation errors from createFriendRequest
        if (
          error.message === "Cannot send friend request to yourself" ||
          error.message === "Friend relationship already exists"
        ) {
          return res.status(400).json({ error: error.message });
        }
        throw error; // Re-throw other errors
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      res.status(500).json({ error: "Failed to send friend request" });
    }
  });

  // API endpoint: Accept friend request (JSON)
  app.put(
    "/api/friends/:friendId/accept",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = getUserFromSession(req);

        if (!user || !user.user_id) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const friendId = parseInt(req.params.friendId);

        if (!friendId || isNaN(friendId)) {
          return res.status(400).json({ error: "Invalid friend ID" });
        }

        // Find the relationship to determine who is the sender and receiver
        const relationship = await databaseService.findFriendRelationship(
          user.user_id,
          friendId
        );

        if (!relationship) {
          return res
            .status(404)
            .json({ error: "Friend relationship not found" });
        }

        // Verify the current user is the receiver (user_id2)
        // In a friend request: user_id1 is the sender, user_id2 is the receiver
        const isReceiver = relationship.user_id2 === user.user_id;

        if (!isReceiver) {
          return res.status(403).json({
            error: "Only the receiver of the friend request can accept it",
          });
        }

        // Accept friend request
        // user.user_id is the receiver (currentUserId)
        // The sender is the other user (user_id1)
        try {
          const updatedRelationship = await databaseService.acceptFriendRequest(
            user.user_id,
            relationship.user_id1
          );

          res.json({
            success: true,
            message: "Friend request accepted successfully",
            friendship: {
              user_id1: updatedRelationship.user_id1,
              user_id2: updatedRelationship.user_id2,
              status: updatedRelationship.status,
              since: updatedRelationship.since,
            },
          });
        } catch (error) {
          // Handle validation errors from acceptFriendRequest
          if (
            error.message === "Friend relationship not found" ||
            error.message.includes("Cannot accept friend request") ||
            error.message ===
              "You are not authorized to accept this friend request"
          ) {
            return res.status(400).json({ error: error.message });
          }
          throw error; // Re-throw other errors
        }
      } catch (error) {
        console.error("Error accepting friend request:", error);
        res.status(500).json({ error: "Failed to accept friend request" });
      }
    }
  );

  // API endpoint: Remove/decline friend or friend request (JSON)
  app.delete("/api/friends/:friendId", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const friendId = parseInt(req.params.friendId);

      if (!friendId || isNaN(friendId)) {
        return res.status(400).json({ error: "Invalid friend ID" });
      }

      // Delete the friendship (handles bidirectional relationships)
      // Works for both accepted friendships and pending requests
      try {
        await databaseService.deleteFriend(user.user_id, friendId);

        res.json({
          success: true,
          message: "Friend removed successfully",
        });
      } catch (error) {
        // Handle validation errors from deleteFriend
        if (error.message === "Friend relationship not found") {
          return res.status(404).json({ error: error.message });
        }
        throw error; // Re-throw other errors
      }
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // Helper function to transform events to FullCalendar format (with friend metadata)
  function transformFriendEventsToFullCalendar(dbEvents, friendUsername) {
    return dbEvents.map((event) => ({
      id: event.event_id.toString(),
      title: event.title,
      start: event.start_at,
      end: event.end_at,
      color: event.colour || "#0000af",
      description: event.description || "",
      extendedProps: {
        event_id: event.event_id,
        user_id: event.user_id,
        friend_username: friendUsername,
        colour: event.colour || "#0000af",
        description: event.description || "",
      },
    }));
  }

  // API endpoint: Get events for a specific friend (JSON)
  app.get(
    "/api/friends/:friendId/events",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = getUserFromSession(req);

        if (!user || !user.user_id) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const friendId = parseInt(req.params.friendId);

        if (!friendId || isNaN(friendId)) {
          return res.status(400).json({ error: "Invalid friend ID" });
        }

        // Verify friendship exists and is ACCEPTED (required for calendar access)
        const relationship = await databaseService.findFriendRelationship(
          user.user_id,
          friendId
        );

        if (!relationship) {
          return res
            .status(404)
            .json({ error: "Friend relationship not found" });
        }

        if (relationship.status !== "ACCEPTED") {
          return res.status(403).json({
            error: "Cannot view calendar. Friendship must be accepted.",
          });
        }

        // Get friend's user details
        const friend =
          relationship.user_id1 === friendId
            ? await databaseService.findUserById(relationship.user_id1)
            : await databaseService.findUserById(relationship.user_id2);

        if (!friend) {
          return res.status(404).json({ error: "Friend user not found" });
        }

        // Optional date range filtering
        const start = req.query.start ? new Date(req.query.start) : null;
        const end = req.query.end ? new Date(req.query.end) : null;

        let friendEvents;
        if (start && end) {
          friendEvents = await databaseService.findEventsByUserIdAndDateRange(
            friendId,
            start,
            end
          );
        } else {
          friendEvents = await databaseService.findEventsByUserId(friendId);
        }

        // Transform events to FullCalendar format with friend metadata
        const events = transformFriendEventsToFullCalendar(
          friendEvents,
          friend.username
        );

        res.json(events);
      } catch (error) {
        console.error("Error fetching friend events:", error);
        res.status(500).json({ error: "Failed to fetch friend events" });
      }
    }
  );

  // API endpoint: Get events for multiple friends (JSON)
  app.get("/api/friends/events", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get friendIds from query parameter (comma-separated) or get all accepted friends
      let friendIds = [];
      const friendIdsParam = req.query.friendIds;

      if (friendIdsParam) {
        // Parse comma-separated friend IDs
        friendIds = friendIdsParam
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id) && id > 0);

        if (friendIds.length === 0) {
          return res.status(400).json({ error: "Invalid friend IDs" });
        }

        // Verify all friendIds are accepted friends of the current user
        const allFriends = await databaseService.getFriends(user.user_id);
        const acceptedFriendIds = allFriends
          .filter((f) => f.status === "ACCEPTED")
          .map((f) => {
            // Get the "other" friend's ID
            return f.user_id1 === user.user_id ? f.user_id2 : f.user_id1;
          });

        // Check if all requested friendIds are in the accepted friends list
        const invalidFriendIds = friendIds.filter(
          (id) => !acceptedFriendIds.includes(id)
        );

        if (invalidFriendIds.length > 0) {
          return res.status(403).json({
            error: `Cannot view calendar for friend(s): ${invalidFriendIds.join(
              ", "
            )}. Friendship must be accepted.`,
          });
        }
      } else {
        // If no friendIds provided, get all accepted friends
        const allFriends = await databaseService.getFriends(user.user_id);
        friendIds = allFriends
          .filter((f) => f.status === "ACCEPTED")
          .map((f) => {
            // Get the "other" friend's ID
            return f.user_id1 === user.user_id ? f.user_id2 : f.user_id1;
          });

        if (friendIds.length === 0) {
          return res.json([]); // No accepted friends, return empty array
        }
      }

      // Optional date range filtering
      const start = req.query.start ? new Date(req.query.start) : null;
      const end = req.query.end ? new Date(req.query.end) : null;

      // Get events for all specified friends
      const friendEvents = await databaseService.findEventsByFriendIds(
        friendIds,
        start,
        end
      );

      // Group events by friend and transform using helper function
      const eventsByFriend = {};
      for (const event of friendEvents) {
        const friendUsername = event.user?.username || "Unknown";
        if (!eventsByFriend[friendUsername]) {
          eventsByFriend[friendUsername] = [];
        }
        eventsByFriend[friendUsername].push(event);
      }

      // Transform events using helper function for each friend
      const allEvents = [];
      for (const [friendUsername, events] of Object.entries(eventsByFriend)) {
        const transformedEvents = transformFriendEventsToFullCalendar(
          events,
          friendUsername
        );
        allEvents.push(...transformedEvents);
      }

      res.json(allEvents);
    } catch (error) {
      console.error("Error fetching friends events:", error);
      res.status(500).json({ error: "Failed to fetch friends events" });
    }
  });

  // API endpoint: Get availability summary for friends (JSON)
  app.get("/api/friends/availability", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get required parameters
      const friendIdsParam = req.query.friendIds;
      const startParam = req.query.start;
      const endParam = req.query.end;

      // Validate required parameters
      if (!friendIdsParam) {
        return res
          .status(400)
          .json({ error: "friendIds query parameter is required" });
      }

      if (!startParam || !endParam) {
        return res
          .status(400)
          .json({ error: "start and end query parameters are required" });
      }

      // Parse friendIds
      const friendIds = friendIdsParam
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id) && id > 0);

      if (friendIds.length === 0) {
        return res.status(400).json({ error: "Invalid friend IDs" });
      }

      // Parse dates
      const startDate = new Date(startParam);
      const endDate = new Date(endParam);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (startDate >= endDate) {
        return res
          .status(400)
          .json({ error: "Start date must be before end date" });
      }

      // Verify all friendIds are accepted friends of the current user
      const allFriends = await databaseService.getFriends(user.user_id);
      const acceptedFriendIds = allFriends
        .filter((f) => f.status === "ACCEPTED")
        .map((f) => {
          // Get the "other" friend's ID
          return f.user_id1 === user.user_id ? f.user_id2 : f.user_id1;
        });

      // Check if all requested friendIds are in the accepted friends list
      const invalidFriendIds = friendIds.filter(
        (id) => !acceptedFriendIds.includes(id)
      );

      if (invalidFriendIds.length > 0) {
        return res.status(403).json({
          error: `Cannot view availability for friend(s): ${invalidFriendIds.join(
            ", "
          )}. Friendship must be accepted.`,
        });
      }

      // Get availability summary
      const availability = await databaseService.findAvailabilityForFriends(
        friendIds,
        startDate,
        endDate
      );

      res.json(availability);
    } catch (error) {
      console.error("Error fetching friends availability:", error);
      res.status(500).json({ error: "Failed to fetch friends availability" });
    }
  });
};
