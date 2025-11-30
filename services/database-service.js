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
}

module.exports = new DatabaseService();
