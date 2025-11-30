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
        user_id: userId
      }
    });
  }

  // create event
  async createEvent(event) {
    return await prisma.event.create({
      data: event,
    });
  }

  // find event
  async findEvent(eventId) {
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

  // delete event
  async deleteEvent(eventId) {
    return await prisma.event.delete({
      where: {
        event_id: eventId,
      },
    });
  }
  // find events by user id
  async findEventsByUserId(userId) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        start_at: {
          gte: new Date(),
        },
      },
    });
  }
  // find events by user id and date
  async findEventsByUserIdAndDate(userId, date) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
        start_at: {
          gte: date,
        },
      },
    });
  }

  // find events by user id and date range (for better performance with date filtering)
  async findEventsByUserIdAndDateRange(userId, startDate, endDate) {
    return await prisma.event.findMany({
      where: {
        user_id: userId,
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

  // get friends
  async getFriends(userId) {
    return await prisma.friend.findMany({
      where: {
      OR : [
        { user_id1: userId },
        { user_id2: userId }
      ]
    }
    });
  }

  // get friend requests
  async getFriendRequests(userId) {
    return await prisma.friend.findMany({
      where: {
        user_id2: userId,
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

  // accept friend request
  async acceptFriendRequest(userId, friendId) {
    return await prisma.friend.update({
      where: {
        user_id1: userId,
        user_id2: friendId,
      },
    });
  }

  // reject friend request
  async rejectFriendRequest(userId, friendId) {
    return await prisma.friend.update({
      where: {
        user_id1: userId,
        user_id2: friendId,
      },
    });
  }

  // delete friend
  async deleteFriend(userId, friendId) {
    return await prisma.friend.delete({
      where: {
        user_id1: userId,
        user_id2: friendId,
      },
    });
  }



}

module.exports = new DatabaseService();
