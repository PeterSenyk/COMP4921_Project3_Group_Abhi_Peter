const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();

class DatabaseService {
  async findUser(username) {
    return await prisma.user.findUnique({
      where: {
        username: username,
      },
    });
  }

  async createUser(username, email, password) {
    return await prisma.user.create({
      data: {
        username: username,
        email: email,
        password_hash: password,
      },
    });
  }

  async checkUserExists(username, email) {
    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username: username }, { email: email }],
        },
      });
      return !!existingUser;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  }

  async createCategory(title, user_id) {
    return await prisma.category.create({
      data: {
        title: title,
        user_id: user_id,
      },
    });
  }

  async getCategories() {
    return await prisma.category.findMany({
      include: {
        post: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async createPost(title, comment, category_id, user_id) {
    try {
      const title_trim = title.trim();
      const comment_trim = comment.trim();
      const cat_id = parseInt(category_id, 10);
      const u_id = parseInt(user_id, 10);

      if (!title_trim || !comment_trim || !category_id || !user_id) {
        throw new Error("Invalid post data");
      }

      return await prisma.post.create({
        data: {
          title: title_trim,
          comment: comment_trim,
          cat_id: cat_id,
          user_id: u_id,
          views: 0,
        },
        include: {
          user: true,
        },
      });
    } catch (error) {
      console.error("Error in createPost:", error);
      console.error("Error message:", error.message);
      console.error("Error code:", error.code);
      if (error.stack) {
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }

  async getPosts() {
    return await prisma.post.findMany({
      include: {
        user: true,
      },
    });
  }

  async getPost(post_id) {
    const id = parseInt(post_id, 10);
    if (Number.isNaN(id)) {
      throw new Error("Invalid post_id");
    }
    return await prisma.post.findUnique({
      where: {
        post_id: id,
      },
      include: {
        user: true,
      },
    });
  }

  async createThread(comment, post_id, user_id, parent_thread_id) {
    const post = await this.getPost(post_id);
    if (!post) {
      throw new Error("Post not found");
    }

    // Only validate parent thread if one is provided
    if (parent_thread_id !== null && parent_thread_id !== undefined) {
      const thread = await this.getThread(parent_thread_id);
      if (!thread) {
        throw new Error("Parent thread not found");
      }
    }

    const user = await this.getUser(user_id);
    if (!user) {
      throw new Error("User not found");
    }

    return await prisma.thread.create({
      data: {
        user_id: user.user_id,
        comment: comment,
        post_id: post_id,
        parent_thread_id: parent_thread_id ?? null,
      },
    });
  }

  async getThreads(post_id) {
    // First get all threads for the post
    const post = await this.getPost(post_id);
    if (!post) {
      throw new Error("Post not found");
    }
    post_id = post.post_id;
    const threads = await prisma.$queryRawUnsafe(`
    select * from getThreadsRec(${post_id});
    `);
    console.log("threads for post: ", post_id, threads);
    return threads;
  }

  async getThreadsTree(post_id, current_user_id = null) {
    const flatThreads = await this.getThreads(post_id);
    if (!flatThreads || flatThreads.length === 0) {
      return [];
    }

    // Get user likes for this post (handle case where ThreadLike table might not exist yet)
    let likedThreadIds = new Set();
    if (current_user_id) {
      try {
        const userLikes = await prisma.threadLike.findMany({
          where: {
            user_id: current_user_id,
            thread: {
              post_id: post_id,
            },
          },
        });
        likedThreadIds = new Set(userLikes.map((like) => like.thread_id));
      } catch (error) {
        console.warn(
          "ThreadLike table query failed (might need Prisma client regeneration):",
          error.message
        );
        // Continue without like status
      }
    }

    // Normalize keys defensively and build a lookup map
    const idToNode = new Map();
    const rootNodes = [];

    for (const t of flatThreads) {
      // Fetch user details including profile image
      const user = await this.getUser(t.user_id);
      const node = {
        thread_id: t.thread_id,
        parent_thread_id: t.parent_thread_id ?? null,
        post_id: t.post_id,
        user_id: t.user_id,
        comment: t.comment,
        created_at: t.created_at || null,
        username: t.username || user?.username || null,
        profile_image_url: user?.profile_image_url || null,
        likes: t.likes || 0,
        isLiked: current_user_id ? likedThreadIds.has(t.thread_id) : false,
        children: [],
      };
      idToNode.set(node.thread_id, node);
    }

    for (const node of idToNode.values()) {
      if (node.parent_thread_id && idToNode.has(node.parent_thread_id)) {
        idToNode.get(node.parent_thread_id).children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Stable ordering: by created_at then by id, where available
    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        if (a.created_at && b.created_at) {
          const aTime = new Date(a.created_at).getTime();
          const bTime = new Date(b.created_at).getTime();
          if (aTime !== bTime) return aTime - bTime;
        }
        return (a.thread_id || 0) - (b.thread_id || 0);
      });
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(rootNodes);

    return rootNodes;
  }

  async getThread(thread_id) {
    return await prisma.thread.findUnique({
      where: {
        thread_id: thread_id,
      },
    });
  }

  async getUser(user_id) {
    return await prisma.user.findUnique({
      where: {
        user_id: user_id,
      },
    });
  }

  async getPostsByCategory(cat_id) {
    return await prisma.post.findMany({
      where: {
        cat_id: cat_id,
      },
      include: {
        user: true,
      },
    });
  }

  async createPoll(post_id, options) {
    // options should be an array of strings
    return await prisma.poll.create({
      data: {
        post_id: post_id,
        options: {
          create: options.map((optionName) => ({
            option_name: optionName,
            votes: 0,
          })),
        },
      },
      include: {
        options: true,
      },
    });
  }

  async getPolls() {
    return await prisma.poll.findMany({
      include: {
        options: true,
        post: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  // User-specific content
  async getUserCategories(user_id) {
    const uid = Number(user_id);
    return await prisma.category.findMany({
      where: { user_id: uid },
      include: { post: true },
    });
  }

  async getUserPosts(user_id) {
    const uid = Number(user_id);
    return await prisma.post.findMany({
      where: { user_id: uid },
      include: { category: true },
    });
  }

  async getUserThreads(user_id) {
    const uid = Number(user_id);
    return await prisma.thread.findMany({
      where: { user_id: uid },
      include: { post: true },
    });
  }

  // Deletions with ownership checks
  async deleteCategory(cat_id, user_id) {
    const category = await prisma.category.findUnique({ where: { cat_id } });
    if (!category || category.user_id !== user_id) {
      return false;
    }
    await prisma.category.delete({ where: { cat_id } });
    return true;
  }

  async deletePost(post_id, user_id) {
    const post = await prisma.post.findUnique({ where: { post_id } });
    if (!post || post.user_id !== user_id) {
      return false;
    }
    await prisma.post.delete({ where: { post_id } });
    return true;
  }

  async deleteThread(thread_id, user_id) {
    const thread = await prisma.thread.findUnique({ where: { thread_id } });
    if (!thread || thread.user_id !== user_id) {
      return false;
    }
    await prisma.thread.delete({ where: { thread_id } });
    return true;
  }

  async getPoll(post_id) {
    const id = parseInt(post_id, 10);
    if (Number.isNaN(id)) {
      throw new Error("Invalid post_id");
    }
    return await prisma.poll.findUnique({
      where: {
        post_id: id,
      },
      include: {
        options: {
          orderBy: {
            option_id: "asc",
          },
        },
        votes: {
          include: {
            option: true,
          },
        },
      },
    });
  }

  async isPoll(post_id) {
    const poll = await this.getPoll(post_id).catch(() => null);
    return !!poll;
  }

  async getUserVote(poll_id, user_id) {
    try {
      return await prisma.vote.findUnique({
        where: {
          poll_id_user_id: {
            poll_id,
            user_id,
          },
        },
        include: {
          option: true,
        },
      });
    } catch (error) {
      return null;
    }
  }

  async submitVote(poll_id, option_id, user_id) {
    // poll_id here is actually the poll.poll_id (primary key), not post_id
    // Check if user already voted
    const existingVote = await this.getUserVote(poll_id, user_id);

    if (existingVote) {
      // User already voted - update their vote
      if (existingVote.option_id === option_id) {
        // Same option - no change needed, return current poll
        const poll = await prisma.poll.findUnique({
          where: { poll_id: poll_id },
        });
        return await this.getPoll(poll.post_id);
      }

      // Different option - update vote
      const oldOptionId = existingVote.option_id;

      // Use transaction to update both options' vote counts
      await prisma.$transaction([
        // Remove old vote
        prisma.vote.delete({
          where: {
            poll_id_user_id: {
              poll_id,
              user_id,
            },
          },
        }),
        // Decrement old option votes
        prisma.option.update({
          where: { option_id: oldOptionId },
          data: { votes: { decrement: 1 } },
        }),
        // Create new vote
        prisma.vote.create({
          data: {
            poll_id,
            option_id,
            user_id,
          },
        }),
        // Increment new option votes
        prisma.option.update({
          where: { option_id },
          data: { votes: { increment: 1 } },
        }),
      ]);
    } else {
      // New vote
      await prisma.$transaction([
        prisma.vote.create({
          data: {
            poll_id,
            option_id,
            user_id,
          },
        }),
        prisma.option.update({
          where: { option_id },
          data: { votes: { increment: 1 } },
        }),
      ]);
    }

    // Return updated poll (poll_id is the primary key)
    const poll = await prisma.poll.findUnique({
      where: { poll_id: poll_id },
    });
    return await this.getPoll(poll.post_id);
  }

  // Profile image update
  async updateUserProfileImage(user_id, profile_image_url) {
    return await prisma.user.update({
      where: { user_id },
      data: { profile_image_url },
    });
  }

  // Views tracking
  async incrementPostViews(post_id) {
    return await prisma.post.update({
      where: { post_id },
      data: { views: { increment: 1 } },
    });
  }

  // Like/Unlike threads
  async toggleThreadLike(thread_id, user_id) {
    let existingLike = null;
    try {
      existingLike = await prisma.threadLike.findUnique({
        where: {
          thread_id_user_id: {
            thread_id,
            user_id,
          },
        },
      });
    } catch (error) {
      // If ThreadLike model doesn't exist yet, treat as no existing like
      console.warn("ThreadLike query failed:", error.message);
    }

    const thread = await prisma.thread.findUnique({
      where: { thread_id },
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    try {
      if (existingLike) {
        // Unlike: remove like record and decrement count
        await prisma.threadLike.delete({
          where: {
            thread_id_user_id: {
              thread_id,
              user_id,
            },
          },
        });
        return await prisma.thread.update({
          where: { thread_id },
          data: { likes: { decrement: 1 } },
        });
      } else {
        // Like: add like record and increment count
        await prisma.threadLike.create({
          data: {
            thread_id,
            user_id,
          },
        });
        return await prisma.thread.update({
          where: { thread_id },
          data: { likes: { increment: 1 } },
        });
      }
    } catch (error) {
      // Fallback: just update likes count if ThreadLike operations fail
      console.warn(
        "ThreadLike operations failed, updating count only:",
        error.message
      );
      const thread = await prisma.thread.findUnique({ where: { thread_id } });
      if (existingLike) {
        // User previously liked, so unlike by decrementing
        return await prisma.thread.update({
          where: { thread_id },
          data: { likes: { decrement: 1 } },
        });
      } else {
        // User didn't like, so like by incrementing
        return await prisma.thread.update({
          where: { thread_id },
          data: { likes: { increment: 1 } },
        });
      }
    }
  }

  async getUserThreadLike(thread_id, user_id) {
    try {
      return await prisma.threadLike.findUnique({
        where: {
          thread_id_user_id: {
            thread_id,
            user_id,
          },
        },
      });
    } catch (error) {
      // If ThreadLike doesn't exist yet, return null
      console.warn("ThreadLike query failed:", error.message);
      return null;
    }
  }

  // Calculate total likes for a post (sum of post's threads + all nested comments)
  async calculateTotalLikesForPost(post_id) {
    const threads = await prisma.thread.findMany({
      where: { post_id },
    });

    // Recursively calculate likes for all threads and their children
    const calculateThreadLikes = (thread) => {
      const directLikes = thread.likes || 0;
      // Note: In our current structure, thread.likes is already the count
      return directLikes;
    };

    let totalLikes = 0;
    for (const thread of threads) {
      totalLikes += calculateThreadLikes(thread);
    }

    return totalLikes;
  }

  // Edit thread (only by owner)
  async updateThread(thread_id, comment, user_id) {
    const thread = await prisma.thread.findUnique({
      where: { thread_id },
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    if (thread.user_id !== user_id) {
      throw new Error("Unauthorized: You can only edit your own comments");
    }

    return await prisma.thread.update({
      where: { thread_id },
      data: { comment },
    });
  }

  // Delete thread - check if user owns thread OR if user owns the post
  async deleteThreadWithAuth(thread_id, user_id) {
    const thread = await prisma.thread.findUnique({
      where: { thread_id },
      include: { post: true },
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    // Allow deletion if user owns thread OR if user owns the post
    if (thread.user_id !== user_id && thread.post.user_id !== user_id) {
      return false;
    }

    await prisma.thread.delete({ where: { thread_id } });
    return true;
  }

  // Get most popular threads for stats page
  async getMostPopularThreads(limit = 10) {
    // Get threads with most likes, including post and user info
    const threads = await prisma.thread.findMany({
      take: limit,
      orderBy: { likes: "desc" },
      include: {
        user: {
          select: {
            username: true,
            profile_image_url: true,
          },
        },
        post: {
          select: {
            post_id: true,
            title: true,
          },
        },
      },
    });

    // Also calculate total likes including children for accurate ranking
    const threadsWithTotalLikes = await Promise.all(
      threads.map(async (thread) => {
        // Get all child threads for this thread
        const getAllDescendants = async (parentId) => {
          const children = await prisma.thread.findMany({
            where: { parent_thread_id: parentId },
          });
          let allDescendants = [...children];
          for (const child of children) {
            const descendants = await getAllDescendants(child.thread_id);
            allDescendants = [...allDescendants, ...descendants];
          }
          return allDescendants;
        };

        const descendants = await getAllDescendants(thread.thread_id);
        const totalLikes =
          thread.likes +
          descendants.reduce((sum, t) => sum + (t.likes || 0), 0);

        return {
          ...thread,
          totalLikes,
        };
      })
    );

    return threadsWithTotalLikes.sort((a, b) => b.totalLikes - a.totalLikes);
  }

  // Get threads with like status for current user
  async getThreadsWithLikeStatus(post_id, user_id) {
    const threads = await prisma.$queryRawUnsafe(`
      select * from getThreadsRec(${post_id});
    `);

    // Get all thread likes for this user
    const userLikes = await prisma.threadLike.findMany({
      where: {
        user_id: user_id || -1,
        thread: {
          post_id: post_id,
        },
      },
    });

    const likedThreadIds = new Set(userLikes.map((like) => like.thread_id));

    // Add liked status to threads
    const threadsWithLikes = threads.map((t) => ({
      ...t,
      isLiked: user_id ? likedThreadIds.has(t.thread_id) : false,
    }));

    return threadsWithLikes;
  }
}

module.exports = new DatabaseService();
