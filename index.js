require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType
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

const settings = {
  logChannel: {},
  antiAbuse: {}
};

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

  const content = msg.content.toLowerCase();

  // -------- Anti Link --------
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

  // -------- Anti Abuse --------
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

  // -------- Commands --------
  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(1).split(/ +/);
  const cmd = args.shift();

  if (cmd === "help") {
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🛡 Security Commands")
          .setDescription(
            "`!setlog #channel`\n" +
            "`!antiabuse on/off`\n" +
            "`!status`"
          )
      ]
    });
  }

  if (cmd === "setlog") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply("Mention a channel");
    settings.logChannel[msg.guild.id] = ch.id;
    return msg.reply("✅ Logs channel set");
  }

  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");
    const opt = args[0];
    if (!["on","off"].includes(opt)) return msg.reply("Use on/off");
    settings.antiAbuse[msg.guild.id] = opt === "on";
    return msg.reply(`✅ Anti-Abuse ${opt.toUpperCase()}`);
  }

  if (cmd === "status") {
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("🛡 Protection Status")
          .addFields(
            { name: "Anti-Abuse", value: settings.antiAbuse[msg.guild.id] ? "ON ✅" : "OFF ❌" },
            { name: "Anti-Link", value: "ON ✅" },
            { name: "Anti-Bot Add", value: "ON ✅" }
          )
      ]
    });
  }
});

// ================= ANTI BOT ADD =================
client.on("guildMemberAdd", async member => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({ type: 28, limit: 1 });
  const entry = logs.entries.first();
  if (!entry || !entry.executor) return;

  await member.ban({ reason: "Unauthorized bot" }).catch(() => {});
  await member.guild.members.ban(entry.executor.id, {
    reason: "Added unauthorized bot"
  }).catch(() => {});

  sendLog(member.guild, new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🤖 Anti-Bot Add")
    .setDescription(`Executor banned: <@${entry.executor.id}>`)
    .setTimestamp()
  );
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
