const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();


class DatabaseService {

    async createUser(user) {
        return await prisma.user.create({
            data: user
        });
    }

    async checkUserExists(username, email) {
        return await prisma.user.findUnique({
            where: {
                username: username,
                email: email
            }
        });
    }

    async findUser(username) {
        return await prisma.user.findUnique({
            where: {
                username: username
            }
        });
    }


}

module.exports = new DatabaseService();