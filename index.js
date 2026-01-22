// ================= KEEP ALIVE (RENDER) =================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("INT Security Alive"));
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

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = ".";
const TIMEOUT_MS = 5 * 60 * 1000;

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

const Guild = mongoose.model("Guild", GuildSchema);
const Warn = mongoose.model("Warn", WarnSchema);

// ================= BAD WORDS =================
const BAD_WORDS = [
  "bsdk","madarchod","nga","nigga","mf",
  "ass","dick","pussy","fuck","bitch","slut","whore"
];

// ================= READY =================
client.once("ready", () => {
  console.log(`🛡 Logged in as ${client.user.tag}`);
  client.user.setActivity("INT Server Protection", {
    type: ActivityType.Watching
  });
});

// ================= LOG FUNCTION =================
async function sendLog(guild, embed) {
  const data = await Guild.findOne({ guildId: guild.id });
  if (!data?.logChannel) return;
  const ch = guild.channels.cache.get(data.logChannel);
  if (ch) ch.send({ embeds: [embed] });
}

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  const content = msg.content.toLowerCase();

  // ===== ANTI ABUSE =====
  if (guildData.antiAbuse && BAD_WORDS.some(w => content.includes(w))) {
    await msg.delete().catch(() => {});
    await msg.member.timeout(TIMEOUT_MS, "Abusive Language").catch(() => {});
    sendLog(msg.guild,
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Anti-Abuse Triggered")
        .setDescription(`User: ${msg.author}\nTimeout: 5 mins`)
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
          .setTitle("🛡 INT Security Commands")
          .setDescription(
            "**Setup**\n" +
            "`!setlog #channel`\n`!antiabuse on/off`\n\n" +
            "**Moderation**\n" +
            "`!warn @user reason`\n`!warns @user`\n`!clearwarns @user`\n\n" +
            "**Reports**\n" +
            "`!reportpanel`"
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
    return msg.reply("✅ Log channel set");
  }

  // ===== ANTIABUSE =====
  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    if (!["on","off"].includes(args[0])) return msg.reply("Use on/off");
    guildData.antiAbuse = args[0] === "on";
    await guildData.save();
    return msg.reply(`✅ Anti-Abuse ${args[0].toUpperCase()}`);
  }

  // ===== WARN =====
  if (cmd === "warn") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return msg.reply("❌ No permission");
    const user = msg.mentions.users.first();
    const reason = args.slice(1).join(" ") || "No reason";
    if (!user) return msg.reply("Mention a user");

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

  if (cmd === "warns") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user");
    const warns = await Warn.find({ guildId: msg.guild.id, userId: user.id });
    if (!warns.length) return msg.reply("No warns");

    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle(`⚠️ Warns for ${user.tag}`)
          .setDescription(
            warns.map((w,i)=>`**${i+1}.** ${w.reason} *(by ${w.moderator})*`).join("\n")
          )
      ]
    });
  }

  if (cmd === "clearwarns") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user");
    await Warn.deleteMany({ guildId: msg.guild.id, userId: user.id });
    return msg.reply("✅ Warns cleared");
  }

  // ===== REPORT PANEL =====
  if (cmd === "reportpanel") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_report")
        .setLabel("📝 Submit Anonymous Report")
        .setStyle(ButtonStyle.Danger)
    );

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff5555)
          .setTitle("📢 Anonymous Report System")
          .setDescription("Click below to submit an anonymous report.")
      ],
      components: [row]
    });
  }
});

// ================= REPORT MODAL =================
client.on("interactionCreate", async i => {
  if (i.isButton() && i.customId === "open_report") {
    const modal = new ModalBuilder()
      .setCustomId("report_modal")
      .setTitle("📝 Anonymous Report")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("target")
            .setLabel("Who are you reporting?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
    return i.showModal(modal);
  }

  if (i.type === InteractionType.ModalSubmit && i.customId === "report_modal") {
    sendLog(i.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("📩 Anonymous Report")
        .addFields(
          { name: "Target", value: i.fields.getTextInputValue("target") },
          { name: "Reason", value: i.fields.getTextInputValue("reason") }
        )
        .setTimestamp()
    );
    return i.reply({ content: "✅ Report submitted.", ephemeral: true });
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
  if (!entry) return;

  await member.ban({ reason: "Unauthorized bot" }).catch(() => {});
  await member.guild.members.ban(entry.executor.id, {
    reason: "Added unauthorized bot"
  }).catch(() => {});

  sendLog(member.guild,
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🤖 Anti-Bot Add")
      .setDescription(`Executor banned: <@${entry.executor.id}>`)
      .setTimestamp()
  );
});

// ================= ANTI NUKE =================
client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelDelete,
    limit: 1
  });

  const entry = logs.entries.first();
  if (!entry || entry.executor.bot) return;

  await channel.guild.members.ban(entry.executor.id, {
    reason: "Channel Nuke Attempt"
  }).catch(() => {});

  sendLog(channel.guild,
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("💥 Anti-Nuke Triggered")
      .setDescription(`Executor banned: <@${entry.executor.id}>`)
      .setTimestamp()
  );
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
