const databaseService = require("../../services/database-service");
const { getUserFromSession, isAuthenticated } = require("../../utils/auth");

module.exports = (app) => {
  app.get("/friends", isAuthenticated, async (req, res) => {
    try {
      const user = getUserFromSession(req);

      let friends = await databaseService.getFriends(user.user_id);

      let friendListfinal = [];

      if (friends.length === 0) {
        friendListfinal = [{ username: "No friends found" }];
      } else {
        // Use Promise.all with map to properly handle async operations
        const friendPromises = friends.map(async (friend) => {
          // Only process ACCEPTED friendships
          if (friend.status !== "ACCEPTED") {
            return null;
          }

          // Determine which user is the "other" friend (not the current user)
          const otherUserId =
            friend.user_id1 === user.user_id
              ? friend.user_id2
              : friend.user_id1;

          // Fetch the other friend's details
          const otherFriend = await databaseService.findUserById(otherUserId);

          if (!otherFriend) {
            return null;
          }

          return {
            username: otherFriend.username,
            user_id: otherFriend.user_id,
          };
        });

        // Wait for all friend lookups to complete
        const friendResults = await Promise.all(friendPromises);

        // Filter out null values (non-accepted friendships or missing users)
        friendListfinal = friendResults.filter((friend) => friend !== null);
      }

      console.log("FriendListFinal: ", friendListfinal);

      res.render("friends", {
        title: "Friends",
        friends: friendListfinal,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal server error");
    }
  });
};
