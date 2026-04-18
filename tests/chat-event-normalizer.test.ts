import { describe, expect, it } from 'vitest';
import { ChatEventBus } from '../src/admin/chat/event-bus.js';
import { ChatEventNormalizer } from '../src/admin/chat/event-normalizer.js';

describe('ChatEventNormalizer', () => {
  it('不应把用户消息的 text part 增量发布成 assistant 回复', () => {
    const bus = new ChatEventBus();
    const normalizer = new ChatEventNormalizer(bus);

    (normalizer as any).onPartUpdated({
      part: {
        id: 'part-user-1',
        type: 'text',
        sessionID: 'session-1',
        messageID: 'message-user-1',
        text: '请回复OK',
      },
      delta: '请回复OK',
    });

    (normalizer as any).onMessageUpdated({
      id: 'message-user-1',
      sessionID: 'session-1',
      role: 'user',
    });

    expect(bus.snapshot('session-1')).toEqual([]);
  });

  it('assistant part 先到时，应在 message.updated 后回放到同一条 assistant 消息', () => {
    const bus = new ChatEventBus();
    const normalizer = new ChatEventNormalizer(bus);

    (normalizer as any).onPartUpdated({
      part: {
        id: 'part-assistant-1',
        type: 'text',
        sessionID: 'session-2',
        messageID: 'message-assistant-1',
        text: 'OK',
      },
      delta: 'OK',
    });

    (normalizer as any).onMessageUpdated({
      id: 'message-assistant-1',
      sessionID: 'session-2',
      role: 'assistant',
      time: { created: 1 },
    });

    const events = bus.snapshot('session-2').map(item => item.event);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'message_start',
      msg: {
        id: 'message-assistant-1',
        role: 'assistant',
      },
    });
    expect(events[1]).toEqual({
      type: 'text_delta',
      msgId: 'message-assistant-1',
      text: 'OK',
    });
  });
});
