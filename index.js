// ===================== KEEP ALIVE (RENDER REQUIRED) =====================
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Bot is alive");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
require("dotenv").config();

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

// ================= STORAGE =================
const settings = {
  logChannel: {},
  antiAbuse: {}
};

const warns = {}; // guildId-userId => [{ reason, mod, time }]

const BAD_WORDS = [
  "bsdk","madarchod","nga","nigga",
  "mf","ass","dick","pussy","fuck",
  "bitch","slut","whore"
];

// ================= READY =================
client.once("ready", () => {
  console.log(`🔐 Security online as ${client.user.tag}`);
  client.user.setActivity("Server Protection", { type: ActivityType.Watching });
});

// ================= LOG =================
async function sendLog(guild, embed) {
  const chId = settings.logChannel[guild.id];
  if (!chId) return;
  const ch = guild.channels.cache.get(chId);
  if (ch) ch.send({ embeds: [embed] });
}

// ================= MESSAGE =================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  const content = msg.content;
const lower = content.toLowerCase();

  // ---------- ANTI LINK ----------
  if (/(https?:\/\/|discord\.gg)/i.test(content)) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await msg.delete().catch(() => {});
      await msg.member.timeout(TIMEOUT_MS, "Anti-Link").catch(() => {});
      sendLog(msg.guild, new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🚫 Anti-Link")
        .setDescription(`User: ${msg.author}`)
        .setTimestamp()
      );
    }
    return;
  }

  // ---------- ANTI ABUSE ----------
  if (
    settings.antiAbuse[msg.guild.id] &&
    BAD_WORDS.some(w => content.includes(w))
  ) {
    await msg.delete().catch(() => {});
    await msg.member.timeout(TIMEOUT_MS, "Abusive language").catch(() => {});
    sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("⚠️ Anti-Abuse")
      .setDescription(`User: ${msg.author}\nAction: 5 min timeout`)
      .setTimestamp()
    );
    return;
  }

  // ---------- COMMANDS ----------
  if (!content.startsWith(PREFIX)) return;
  const args = msg.content.slice(1).trim().split(/ +/);
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
    settings.logChannel[msg.guild.id] = ch.id;
    return msg.reply("✅ Logs channel set");
  }

  // ===== ANTIABUSE TOGGLE =====
  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const opt = args[0];
    if (!["on","off"].includes(opt)) return msg.reply("Use on/off");
    settings.antiAbuse[msg.guild.id] = opt === "on";
    return msg.reply(`✅ Anti-Abuse ${opt.toUpperCase()}`);
  }

  // ===== WARN SYSTEM =====
  if (cmd === "warn") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return msg.reply("❌ No permission");

    const user = msg.mentions.users.first();
    const reason = args.slice(1).join(" ") || "No reason";
    if (!user) return msg.reply("Mention a user");

    const key = `${msg.guild.id}-${user.id}`;
    warns[key] ??= [];
    warns[key].push({
      reason,
      mod: msg.author.tag,
      time: new Date().toLocaleString()
    });

    sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("⚠️ User Warned")
      .setDescription(
        `User: ${user}\nModerator: ${msg.author}\nReason: ${reason}`
      )
      .setTimestamp()
    );

    return msg.reply(`⚠️ Warned ${user}`);
  }

  if (cmd === "warns") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user");
    const key = `${msg.guild.id}-${user.id}`;
    const list = warns[key];
    if (!list || !list.length) return msg.reply("No warns");

    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle(`⚠️ Warns for ${user.tag}`)
          .setDescription(
            list.map((w,i)=>`**${i+1}.** ${w.reason} *(by ${w.mod})*`).join("\n")
          )
      ]
    });
  }

  if (cmd === "clearwarns") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user");
    delete warns[`${msg.guild.id}-${user.id}`];
    return msg.reply("✅ Warns cleared");
  }

  // ===== REPORT PANEL =====
  if (cmd === "reportpanel") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_report")
        .setLabel("📝 Submit Report")
        .setStyle(ButtonStyle.Danger)
    );

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff5555)
          .setTitle("📢 Anonymous Report System")
          .setDescription(
            "Click the button below to submit an **anonymous report**.\n" +
            "Reports go **directly to staff logs**."
          )
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
      .setTitle("📝 Anonymous Report");

    modal.addComponents(
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
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("proof")
          .setLabel("Proof / Context (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );

    return i.showModal(modal);
  }

  if (i.type === InteractionType.ModalSubmit && i.customId === "report_modal") {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("📩 New Anonymous Report")
      .addFields(
        { name: "Target", value: i.fields.getTextInputValue("target") },
        { name: "Reason", value: i.fields.getTextInputValue("reason") },
        { name: "Proof", value: i.fields.getTextInputValue("proof") || "None" }
      )
      .setTimestamp();

    sendLog(i.guild, embed);
    return i.reply({ content: "✅ Report submitted anonymously.", ephemeral: true });
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
