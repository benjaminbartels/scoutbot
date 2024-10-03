import { Client } from "discord.js";
import { commands } from "./commands";
import { config } from "./config";
import { deployCommands } from "./deploy-commands";
import { syncEvents } from "./events";

const client = new Client({
  intents: ["Guilds", "GuildMessages", "DirectMessages"],
});

client.once("ready", async () => {
  console.log("Discord bot is ready! 🤖");

  client.guilds.cache.forEach((guild) => {
    console.log(`Starting sync for guild: ${guild.name} (${guild.id})`);

    syncEvents(client, guild.id);

    setInterval(() => {
      console.log(`Syncing events for guild: ${guild.name} (${guild.id})`);
      syncEvents(client, guild.id);
    }, 15 * 60 * 1000);
  });
});
client.on("guildCreate", async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }
  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) {
    commands[commandName as keyof typeof commands].execute(interaction);
  }
});

client.login(config.DISCORD_TOKEN);
