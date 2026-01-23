// ================= KEEP ALIVE (RENDER) =================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Security Bot Alive"));
app.listen(process.env.PORT || 3000);

// ================= ENV =================
require("dotenv").config();

// ================= IMPORTS =================
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  AuditLogEvent
} = require("discord.js");
const mongoose = require("mongoose");

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const PREFIX = "!";
const TIMEOUT_MS = 5 * 60 * 1000;
const NUKELIMIT = 3;

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ Mongo Error:", err);
    process.exit(1);
  });

// ================= SCHEMAS =================
const GuildSchema = new mongoose.Schema({
  guildId: String,
  logChannel: String,
  antiAbuse: { type: Boolean, default: false }
});

const WarnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  moderator: String,
  time: String
});

const NukeSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  count: { type: Number, default: 0 }
});

const WhitelistSchema = new mongoose.Schema({
  guildId: String,
  userId: String
});

const Guild = mongoose.model("Guild", GuildSchema);
const Warn = mongoose.model("Warn", WarnSchema);
const Nuke = mongoose.model("Nuke", NukeSchema);
const Whitelist = mongoose.model("Whitelist", WhitelistSchema);

// ================= BAD WORDS =================
const BAD_WORDS = [
  "bsdk","madarchod","nga","nigga","mf",
  "ass","dick","pussy","fuck","bitch","slut","whore"
];

// ================= READY =================
client.once("ready", () => {
  console.log(`🛡 Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Protection", { type: ActivityType.Watching });
});

// ================= HELPERS =================
async function isWhitelisted(guildId, userId) {
  const data = await Whitelist.findOne({ guildId, userId });
  return !!data;
}

async function sendLog(guild, embed) {
  const data = await Guild.findOne({ guildId: guild.id });
  if (!data?.logChannel) return;
  const ch = guild.channels.cache.get(data.logChannel);
  if (ch) ch.send({ embeds: [embed] });
}

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  const content = msg.content.toLowerCase();

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // ===== ANTI ABUSE =====
  if (guildData.antiAbuse && BAD_WORDS.some(w => content.includes(w))) {
    await msg.delete().catch(()=>{});
    await msg.member.timeout(TIMEOUT_MS, "Abusive language").catch(()=>{});

    sendLog(msg.guild,
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Anti-Abuse")
        .setDescription(`User: ${msg.author}`)
        .setTimestamp()
    );
    return;
  }

  // ===== COMMANDS =====
  if (!content.startsWith(PREFIX)) return;
  const args = msg.content.slice(1).split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  // ===== HELP =====
  if (cmd === "help") {
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🛡 Security Commands")
          .setDescription(
            "**Setup**\n" +
            "`!setlog #channel`\n`!antiabuse on/off`\n\n" +
            "**Whitelist**\n" +
            "`!whitelist add @user`\n" +
            "`!whitelist remove @user`\n" +
            "`!whitelist list`\n\n" +
            "**Moderation**\n" +
            "`!warn @user reason`\n`!warns @user`\n`!clearwarns @user`\n\n" +
            "**Protection**\n" +
            "• Anti-Nuke\n• Anti-Bot Add\n• Auto Channel Restore"
          )
      ]
    });
  }

  // ===== SET LOG =====
  if (cmd === "setlog") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply("Mention a channel");
    guildData.logChannel = ch.id;
    await guildData.save();
    return msg.reply("✅ Logs channel set");
  }

  // ===== ANTIABUSE TOGGLE =====
  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    if (!["on","off"].includes(args[0])) return msg.reply("Use on/off");
    guildData.antiAbuse = args[0] === "on";
    await guildData.save();
    return msg.reply(`✅ Anti-Abuse ${args[0].toUpperCase()}`);
  }

  // ===== WHITELIST =====
  if (cmd === "whitelist") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");

    const action = args[0];
    const user = msg.mentions.users.first();

    if (action === "add") {
      if (!user) return msg.reply("Usage: `!whitelist add @user`");
      if (await isWhitelisted(msg.guild.id, user.id))
        return msg.reply("⚠️ Already whitelisted.");

      await Whitelist.create({ guildId: msg.guild.id, userId: user.id });
      return msg.reply(`✅ ${user.tag} added to whitelist`);
    }

    if (action === "remove") {
      if (!user) return msg.reply("Usage: `!whitelist remove @user`");
      await Whitelist.deleteOne({ guildId: msg.guild.id, userId: user.id });
      return msg.reply(`❌ ${user.tag} removed from whitelist`);
    }

    if (action === "list") {
      const list = await Whitelist.find({ guildId: msg.guild.id });
      if (!list.length) return msg.reply("📭 Whitelist empty");

      const users = await Promise.all(
        list.map(w => msg.client.users.fetch(w.userId).catch(()=>null))
      );

      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Whitelisted Users")
            .setDescription(users.filter(Boolean).map(u=>`• ${u.tag}`).join("\n"))
        ]
      });
    }
  }

  // ===== WARN SYSTEM =====
  if (cmd === "warn") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return msg.reply("❌ No permission");

    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user");
    const reason = args.slice(1).join(" ") || "No reason";

    await Warn.create({
      guildId: msg.guild.id,
      userId: user.id,
      reason,
      moderator: msg.author.tag,
      time: new Date().toLocaleString()
    });

    sendLog(msg.guild,
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⚠️ User Warned")
        .setDescription(`User: ${user}\nReason: ${reason}`)
        .setTimestamp()
    );

    return msg.reply(`⚠️ Warned ${user}`);
  }
});

// ================= ANTI BOT ADD =================
client.on("guildMemberAdd", async member => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1
  });
  const entry = logs.entries.first();
  if (!entry?.executor) return;

  if (await isWhitelisted(member.guild.id, entry.executor.id)) return;

  await member.ban({ reason: "Unauthorized bot" }).catch(()=>{});
  await member.guild.members.ban(entry.executor.id, {
    reason: "Unauthorized bot add"
  }).catch(()=>{});

  sendLog(member.guild,
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🤖 Anti-Bot Add")
      .setDescription(`Executor banned: <@${entry.executor.id}>`)
      .setTimestamp()
  );
});

// ================= ANTI NUKE + AUTO RESTORE =================
client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelDelete,
    limit: 1
  });
  const entry = logs.entries.first();
  if (!entry?.executor) return;

  if (await isWhitelisted(channel.guild.id, entry.executor.id)) return;

  const data = await Nuke.findOneAndUpdate(
    { guildId: channel.guild.id, userId: entry.executor.id },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  await channel.guild.channels.create({
    name: channel.name,
    type: channel.type,
    parent: channel.parent,
    position: channel.position
  });

  if (data.count >= NUKELIMIT) {
    await channel.guild.members.ban(entry.executor.id, {
      reason: "Anti-Nuke Triggered"
    }).catch(()=>{});

    await Nuke.deleteOne({ guildId: channel.guild.id, userId: entry.executor.id });

    sendLog(channel.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔥 Anti-Nuke Triggered")
        .setDescription(`Executor banned: <@${entry.executor.id}>`)
        .setTimestamp()
    );
  }
});

// ================= LOGIN =================
client.login(TOKEN);
