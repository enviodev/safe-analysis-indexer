import { createEffect, S } from "envio";
import amqp from "amqplib";

/**
 * RabbitMQ Event Publisher Effect
 * 
 * Setup:
 * 1. Start RabbitMQ: `docker-compose -f docker-compose.rabbitmq.yml up -d`
 * 2. Run the indexer: `pnpm dev`
 */

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE || "safe_events";

// Simple schema: just the essentials
const publishEventInputSchema = S.schema({
  eventId: S.string,        // txHash-logIndex (for deduplication)
  eventType: S.string,      // e.g. "owner.added"
  txHash: S.string,
  blockNumber: S.number,
  safeAddress: S.string,
  owner: S.string,
});

export type PublishEventInput = S.Infer<typeof publishEventInputSchema>;

// Lazy-initialized channel
let channelPromise: Promise<amqp.Channel> | null = null;

async function getChannel(): Promise<amqp.Channel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const conn = await amqp.connect(RABBITMQ_URL);
      const ch = await conn.createChannel();
      await ch.assertExchange(RABBITMQ_EXCHANGE, "topic", { durable: true });
      console.log(`Connected to RabbitMQ, exchange: ${RABBITMQ_EXCHANGE}`);
      return ch;
    })();
  }
  return channelPromise;
}

export const publishEventToQueue = createEffect(
  {
    name: "publishEventToQueue",
    input: publishEventInputSchema,
    output: S.schema({
      success: S.boolean,
      eventId: S.string,
    }),
    rateLimit: false,
    cache: true,
  },
  async ({ input, context }) => {
    const { eventId, eventType } = input;

    try {
      const ch = await getChannel();
      const routingKey = `safe.${eventType}`;
      
      ch.publish(
        RABBITMQ_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(input)),
        { persistent: true, contentType: "application/json", messageId: eventId }
      );

      return { success: true, eventId };
    } catch (error) {
      context.log.error(`Failed to publish`, { eventId, error: String(error) });
      throw error;
    }
  }
);

// Helper to create input for the effect
export function createEventInput(
  event: {
    srcAddress: string;
    block: { number: number };
    transaction: { hash: string };
    logIndex: number;
  },
  eventType: string,
  owner: string
): PublishEventInput {
  return {
    eventId: `${event.transaction.hash}-${event.logIndex}`,
    eventType,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    safeAddress: event.srcAddress,
    owner,
  };
}
