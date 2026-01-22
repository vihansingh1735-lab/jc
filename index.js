// ================= KEEP ALIVE =================
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
  InteractionType
} = require("discord.js");
const mongoose = require("mongoose");

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = "!";
const TIMEOUT_MS = 5 * 60 * 1000;

// ================= DATABASE =================
mongoose.set("strictQuery", true);

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 5
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => {
  console.error("❌ MongoDB Error:", err);
  process.exit(1);
});

// ================= SCHEMAS =================
const Guild = mongoose.model("Guild", new mongoose.Schema({
  guildId: { type: String, unique: true },
  logChannel: String,
  antiAbuse: { type: Boolean, default: false }
}));

const Warn = mongoose.model("Warn", new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  moderator: String,
  time: String
}));

// ================= CACHE =================
const guildCache = new Map();

// ================= BAD WORDS =================
const BAD_WORDS = [
  "bsdk","madarchod","nga","nigga",
  "mf","ass","dick","pussy","fuck",
  "bitch","slut","whore"
];

// ================= READY =================
client.once("ready", async () => {
  console.log(`🛡 Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Protection", { type: ActivityType.Watching });

  const guilds = await Guild.find();
  for (const g of guilds) guildCache.set(g.guildId, g);

  console.log(`📦 Cached ${guildCache.size} guild configs`);
});

// ================= SAFE LOG =================
async function sendLog(guild, embed) {
  const data = guildCache.get(guild.id);
  if (!data?.logChannel) return;
  const ch = guild.channels.cache.get(data.logChannel);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

// ================= MESSAGE =================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  let guildData = guildCache.get(msg.guild.id);
  if (!guildData) {
    guildData = await Guild.create({ guildId: msg.guild.id });
    guildCache.set(msg.guild.id, guildData);
  }

  const content = msg.content.toLowerCase();

  // ===== ANTI LINK =====
  if (/(https?:\/\/|discord\.gg)/i.test(content)) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await msg.delete().catch(() => {});
      await msg.member.timeout(TIMEOUT_MS, "Anti-Link").catch(() => {});
      sendLog(msg.guild,
        new EmbedBuilder().setColor(0xff0000).setTitle("🚫 Anti-Link")
          .setDescription(`User: ${msg.author}`).setTimestamp()
      );
    }
    return;
  }

  // ===== ANTI ABUSE =====
  if (guildData.antiAbuse && BAD_WORDS.some(w => content.includes(w))) {
    await msg.delete().catch(() => {});
    await msg.member.timeout(TIMEOUT_MS, "Abusive Language").catch(() => {});
    sendLog(msg.guild,
      new EmbedBuilder().setColor(0xe67e22).setTitle("⚠️ Anti-Abuse")
        .setDescription(`User: ${msg.author}`).setTimestamp()
    );
    return;
  }

  // ===== COMMANDS =====
  if (!content.startsWith(PREFIX)) return;
  const args = msg.content.slice(1).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  // PING
  if (cmd === "ping") {
    return msg.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  // HELP
  if (cmd === "help") {
    return msg.reply({
      embeds: [
        new EmbedBuilder().setColor(0x2ecc71).setTitle("🛡 Security Commands")
          .setDescription(
            "`!ping`\n`!setlog #channel`\n`!antiabuse on/off`\n" +
            "`!warn @user reason`\n`!warns @user`\n`!clearwarns @user`\n" +
            "`!reportpanel`"
          )
      ]
    });
  }

  // SET LOG
  if (cmd === "setlog") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");

    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply("Mention a channel");

    guildData.logChannel = ch.id;
    await guildData.save();
    guildCache.set(msg.guild.id, guildData);

    return msg.reply("✅ Logs channel set");
  }

  // ANTIABUSE
  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");

    if (!["on","off"].includes(args[0]))
      return msg.reply("Use on/off");

    guildData.antiAbuse = args[0] === "on";
    await guildData.save();
    guildCache.set(msg.guild.id, guildData);

    return msg.reply(`✅ Anti-Abuse ${args[0].toUpperCase()}`);
  }

  // WARN
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

    return msg.reply(`⚠️ Warned ${user}`);
  }

  // REPORT PANEL
  if (cmd === "reportpanel") {
    return msg.channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff5555)
          .setTitle("📢 Anonymous Report")
          .setDescription("Click below to submit anonymously.")
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_report")
            .setLabel("Submit Report")
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }
});

// ================= MODAL =================
client.on("interactionCreate", async i => {
  if (i.isButton() && i.customId === "open_report") {
    const modal = new ModalBuilder()
      .setCustomId("report_modal")
      .setTitle("Anonymous Report")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("target")
            .setLabel("Who?").setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("reason")
            .setLabel("Reason").setStyle(TextInputStyle.Paragraph)
        )
      );
    return i.showModal(modal);
  }

  if (i.type === InteractionType.ModalSubmit) {
    return i.reply({ content: "✅ Report submitted.", ephemeral: true });
  }
});

// ================= CRASH PROTECTION =================
process.on("unhandledRejection", err => console.error("UNHANDLED:", err));
process.on("uncaughtException", err => console.error("CRASH:", err));

// ================= LOGIN =================
client.login(process.env.TOKEN);
