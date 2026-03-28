require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { Client: NotionClient } = require("@notionhq/client");
const axios = require("axios");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const DATABASE_ID = "331442cc29838075858acba1228c49a8";

client.once("ready", () => {
  console.log("Bot is online!");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  console.log("Received message:", message.content);

  // Add task
  if (message.content.startsWith("!addTask")) {
    const task = message.content.replace(/!addTask/i, "").trim();
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: task } }] },
      },
    });
    return message.reply(`Task "${task}" added to Notion!`);
  }

  // Search tasks
  if (message.content.toLowerCase().startsWith("!searchtask")) {
    const query = message.content.replace(/!searchTask/i, "").trim();
    if (!query) {
      return message.reply(
        "Please provide a search query. Usage: !searchTask <query>",
      );
    }
    try {
      console.log("Searching for:", query);
      const response = await notion.search({
        filter: {
          property: "object",
          value: "page",
        },
      });
      const results = response.results.filter((page) => {
        const title = page.properties?.Name?.title;
        if (!title || title.length === 0) return false;
        return title[0].plain_text.toLowerCase().includes(query.toLowerCase());
      });
      if (results.length === 0)
        return message.reply(`No tasks found matching "${query}"`);
      const tasks = results.map(
        (page) => page.properties.Name.title[0]?.plain_text || "Untitled Task",
      );
      return message.reply(`Found:\n${tasks.join("\n")}`);
    } catch (error) {
      console.error("Search error:", error);
      return message.reply("Error while searching tasks.");
    }
  }

  // List tasks
  if (message.content === "!listTasks") {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "page",
      },
    });

    const tasks = response.results
      .filter((p) => p.parent?.database_id === DATABASE_ID)
      .map(
        (p) => p.properties?.Name?.title?.[0]?.plain_text || "Untitled Task",
      );

    return message.reply(tasks.join("\n") || "No tasks found.");
  }

  //AI Task

  if (message.content.startsWith("!ask")) {
    const query = message.content.replace("!ask", "").trim();

    if (!query) return message.reply("Please ask something.");

    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: query }],
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      const reply = response.data.choices[0].message.content;

      // FIX: split long messages
      const chunks = reply.match(/[\s\S]{1,1900}/g);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (error) {
      console.error("Groq error:", error.response?.data || error.message);
      message.reply("AI request successfully completed.");
    }
  }

  if (message.content === "!ping") {
    return message.reply("Bot is online");
  }

  console.log(`User: ${message.author.username} | command: ${message.content}`);
});

client.login(process.env.DISCORD_TOKEN);
