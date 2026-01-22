// ================== KEEPALIVE (RENDER SAFE) ==================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot alive"));
app.listen(process.env.PORT || 3000);

// ================== IMPORTS ==================
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");

// ================== CONFIG ==================
const PREFIX = "!";
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const DB_FILE = "./security.json";

// ================== DEFAULT DATA ==================
let db = {
  antiAbuse: true,
  antiNuke: true,
  logChannel: null,
  badWords: [
    "bsdk", "nga", "nigga", "mf", "ass", "dick", "pussy",
    "fuck", "bitch", "motherfucker", "slut"
  ]
};

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

const saveDB = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================== HELPERS ==================
const isAdmin = m =>
  m.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  m.author.id === OWNER_ID;

async function sendLog(guild, embed) {
  if (!db.logChannel) return;
  const channel = guild.channels.cache.get(db.logChannel);
  if (channel) channel.send({ embeds: [embed] });
}

// ================== ANTI-ABUSE ==================
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (!db.antiAbuse) return;

  const content = message.content.toLowerCase();
  const found = db.badWords.find(w => content.includes(w));
  if (!found) return;

  await message.delete().catch(() => {});
  await message.member.timeout(60_000, "Bad language").catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🚫 Anti-Abuse Triggered")
    .setDescription(
      `**User:** ${message.author.tag}\n` +
      `**Word:** ${found}`
    )
    .setTimestamp();

  sendLog(message.guild, embed);
});

// ================== ANTI-NUKE ==================
client.on("channelDelete", async channel => {
  if (!db.antiNuke) return;

  const logs = await channel.guild.fetchAuditLogs({
    type: 12,
    limit: 1
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;
  if (!user || user.id === OWNER_ID) return;

  await channel.guild.members.ban(user.id, {
    reason: "Anti-Nuke: Channel Deletion"
  }).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🛡 Anti-Nuke Activated")
    .setDescription(
      `**User:** ${user.tag}\n` +
      `**Action:** Channel Deleted\n` +
      `**Punishment:** Auto-Ban`
    )
    .setTimestamp();

  sendLog(channel.guild, embed);
});

// ================== COMMANDS ==================
client.on("messageCreate", async message => {
  if (!message.content.startsWith(PREFIX)) return;
  if (!message.guild) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  // ===== HELP =====
  if (cmd === "help") {
    return message.reply(`
🛡 **Security Commands**

!antiabuse on/off
!antinuke on/off
!setlogs #channel
!addword <word>
!removeword <word>
!badwords
!security
`);
  }

  if (!isAdmin(message)) return;

  // ===== TOGGLES =====
  if (cmd === "antiabuse") {
    db.antiAbuse = args[0] === "on";
    saveDB();
    return message.reply(`Anti-Abuse **${db.antiAbuse ? "ENABLED" : "DISABLED"}**`);
  }

  if (cmd === "antinuke") {
    db.antiNuke = args[0] === "on";
    saveDB();
    return message.reply(`Anti-Nuke **${db.antiNuke ? "ENABLED" : "DISABLED"}**`);
  }

  // ===== LOG CHANNEL =====
  if (cmd === "setlogs") {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Mention a channel.");
    db.logChannel = channel.id;
    saveDB();
    return message.reply(`Logs channel set to ${channel}`);
  }

  // ===== BAD WORDS =====
  if (cmd === "addword") {
    const word = args[0];
    if (!word) return;
    if (!db.badWords.includes(word)) {
      db.badWords.push(word);
      saveDB();
    }
    return message.reply(`Added **${word}**`);
  }

  if (cmd === "removeword") {
    db.badWords = db.badWords.filter(w => w !== args[0]);
    saveDB();
    return message.reply(`Removed **${args[0]}**`);
  }

  if (cmd === "badwords") {
    return message.reply(db.badWords.join(", "));
  }

  if (cmd === "security") {
    return message.reply(
      `🛡 **Security Status**\n` +
      `Anti-Abuse: ${db.antiAbuse ? "ON" : "OFF"}\n` +
      `Anti-Nuke: ${db.antiNuke ? "ON" : "OFF"}`
    );
  }
});

// ================== READY ==================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================== LOGIN ==================
client.login(TOKEN);
