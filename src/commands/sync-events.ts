import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { syncEvents } from "../events";

export const data = new SlashCommandBuilder()
  .setName("sync-events")
  .setDescription("Synchronizes of Disccord Events with Scoutbook Calendar");

export async function execute(interaction: CommandInteraction) {
  let client = interaction.client;
  let guildId = interaction.commandGuildId;

  if (!guildId) {
    return interaction.reply("Error: GuildId not found!");
  }
  syncEvents(client, guildId);

  return interaction.reply("Syncing with Scoutbook...");
}
