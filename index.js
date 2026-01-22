// ================== ENV ==================
require("dotenv").config();

// ================== IMPORTS ==================
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

// ================== CONFIG ==================
const TOKEN = process.env.TOKEN;
const PREFIX = "!";
const STAFF_ROLE_NAME = "Tester";

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================== MEMORY DB ==================
const testers = [];
let testerIndex = 0;

const tickets = {}; 
// channelId => { ownerId, testerId, aiLocked }

// ================== READY ==================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================== APPLY PANEL ==================
function panelEmbed() {
  return new EmbedBuilder()
    .setTitle("🎟 Apply for Testing")
    .setDescription("Click the button below to apply.")
    .setColor(0x2b2d31);
}

function panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("apply_ticket")
      .setLabel("Apply")
      .setStyle(ButtonStyle.Primary)
  );
}

// ================== APPLICATION FORM ==================
function formEmbed() {
  return new EmbedBuilder()
    .setTitle("📄 Application Form")
    .setDescription(
      "1. How much XP do you have?\n" +
      "2. Which country are you from?\n" +
      "3. Are you good with taser?\n" +
      "4. Are you good with guns?\n" +
      "5. Roblox Username?"
    )
    .setColor(0x3498db);
}

// ================== TESTER CONFIRM ==================
function confirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirm_test")
      .setLabel("Confirm Test")
      .setStyle(ButtonStyle.Success)
  );
}

// ================== COMMANDS ==================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const args = msg.content.split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // PANEL
  if (cmd === "!panel") {
    return msg.channel.send({
      embeds: [panelEmbed()],
      components: [panelRow()]
    });
  }

  // TESTER COMMANDS
  if (cmd === "!tester") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only");

    const sub = args[0];
    const user = msg.mentions.users.first();

    if (sub === "add" && user) {
      if (!testers.includes(user.id)) testers.push(user.id);
      return msg.reply("✅ Tester added");
    }

    if (sub === "remove" && user) {
      const i = testers.indexOf(user.id);
      if (i !== -1) testers.splice(i, 1);
      return msg.reply("✅ Tester removed");
    }

    if (sub === "list") {
      return msg.reply(
        testers.length
          ? testers.map(id => `<@${id}>`).join("\n")
          : "No testers"
      );
    }
  }

  // AI TICKET BRAIN
  if (tickets[msg.channel.id]) {
    const ticket = tickets[msg.channel.id];

    if (ticket.aiLocked) return;

    const content = msg.content.toLowerCase();

    const allowed =
      content.includes("xp") ||
      content.includes("country") ||
      content.includes("taser") ||
      content.includes("gun") ||
      content.includes("roblox") ||
      content.match(/\d/);

    if (!allowed) {
      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setDescription("🤖 I can’t reply regarding this. Please wait for your tester.")
        ]
      });
    }
  }
});

// ================== INTERACTIONS ==================
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;

  // APPLY
  if (i.customId === "apply_ticket") {
    const channel = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: ["ViewChannel"] },
        { id: i.user.id, allow: ["ViewChannel", "SendMessages"] }
      ]
    });

    tickets[channel.id] = {
      ownerId: i.user.id,
      testerId: null,
      aiLocked: false
    };

    await channel.send({ embeds: [formEmbed()] });
    await i.reply({ content: "🎟 Ticket created", ephemeral: true });
  }

  // CONFIRM TEST
  if (i.customId === "confirm_test") {
    const ticket = tickets[i.channel.id];
    if (!ticket) return;

    ticket.aiLocked = true;
    ticket.testerId = i.user.id;

    await i.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`✅ Tester <@${i.user.id}> assigned. AI locked.`)
      ]
    });

    await i.reply({ content: "Confirmed", ephemeral: true });
  }
});

// ================== LOGIN ==================
client.login(TOKEN);
