// ===================== KEEP ALIVE =====================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot alive"));
app.listen(process.env.PORT || 3000);

// ===================== IMPORTS =====================
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PREFIX = "!";

const TIMEOUT_MS = 5 * 60 * 1000;

// ===================== BAD WORDS =====================
const BAD_WORDS = [
  "bsdk", "madarchod", "mc", "bc",
  "nga", "nigga", "mf",
  "ass", "dick", "pussy", "fuck"
];

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// ===================== STORAGE =====================
const settings = {}; 
// guildId: { log, antiabuse, antilink, antinuke }

const nukeTracker = {};

// ===================== READY =====================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Protection", {
    type: ActivityType.Watching
  });
});

// ===================== HELP EMBED =====================
function helpEmbed(guild) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("🛡️ Security System")
    .setDescription(
      "**Commands:**\n\n" +
      "`!setlog #channel`\n\n" +
      "`!antiabuse on/off`\n" +
      "`!antilink on/off`\n" +
      "`!antinuke on/off`\n\n" +
      "`!ping`"
    )
    .setFooter({ text: guild.name });
}

// ===================== LOG =====================
function sendLog(guild, embed) {
  const g = settings[guild.id];
  if (!g?.log) return;
  const ch = guild.channels.cache.get(g.log);
  if (ch) ch.send({ embeds: [embed] });
}

// ===================== MESSAGE =====================
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  if (!settings[guildId]) {
    settings[guildId] = {
      antiabuse: false,
      antilink: false,
      antinuke: false,
      log: null
    };
  }

  const g = settings[guildId];
  const content = message.content.toLowerCase();

  // ===================== OWNER BYPASS =====================
  if (message.author.id === OWNER_ID) return;

  // ===================== ANTI LINK =====================
  if (g.antilink && /(https?:\/\/|discord\.gg)/i.test(content)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.delete().catch(() => {});
      await message.member.timeout(TIMEOUT_MS, "Anti-Link").catch(() => {});
      sendLog(message.guild,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Link Blocked")
          .setDescription(`${message.author}`)
          .setTimestamp()
      );
    }
    return;
  }

  // ===================== ANTI ABUSE =====================
  if (g.antiabuse && BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    await message.member.timeout(TIMEOUT_MS, "Abusive language").catch(() => {});
    sendLog(message.guild,
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Abuse Detected")
        .setDescription(`${message.author} — 5 min timeout`)
        .setTimestamp()
    );
    return;
  }

  // ===================== PREFIX =====================
  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift();

  // ===================== COMMANDS =====================
  if (cmd === "help") {
    return message.reply({ embeds: [helpEmbed(message.guild)] });
  }

  if (cmd === "ping") {
    return message.reply(`🏓 ${client.ws.ping}ms`);
  }

  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("Admin only.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("Mention a channel.");

    g.log = ch.id;
    return message.reply("✅ Logs channel set.");
  }

  if (cmd === "antiabuse") {
    g.antiabuse = args[0] === "on";
    return message.reply(`Anti-Abuse **${g.antiabuse ? "ENABLED" : "DISABLED"}**`);
  }

  if (cmd === "antilink") {
    g.antilink = args[0] === "on";
    return message.reply(`Anti-Link **${g.antilink ? "ENABLED" : "DISABLED"}**`);
  }

  if (cmd === "antinuke") {
    g.antinuke = args[0] === "on";
    return message.reply(`Anti-Nuke **${g.antinuke ? "ENABLED" : "DISABLED"}**`);
  }
});

// ===================== ANTI NUKE =====================
async function handleNuke(member, reason) {
  const g = settings[member.guild.id];
  if (!g?.antinuke) return;

  const key = `${member.guild.id}-${member.id}`;
  nukeTracker[key] = (nukeTracker[key] || 0) + 1;

  if (nukeTracker[key] >= 3) {
    await member.ban({ reason: "Anti-Nuke Triggered" }).catch(() => {});
    sendLog(member.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔥 Anti-Nuke")
        .setDescription(`${member.user.tag}\n${reason}`)
        .setTimestamp()
    );
  }

  setTimeout(() => delete nukeTracker[key], 60_000);
}

client.on("channelDelete", async ch => {
  const logs = await ch.guild.fetchAuditLogs({ limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Channel Delete");
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({ limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Role Delete");
});

// ===================== LOGIN =====================
client.login(TOKEN);
