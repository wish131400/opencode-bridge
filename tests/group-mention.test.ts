import { describe, expect, it } from 'vitest';
import { shouldSkipGroupMessage } from '../src/utils/group-mention.js';
import type { PlatformMessageEvent } from '../src/platform/types.js';

describe('shouldSkipGroupMessage', () => {
  const baseEvent: PlatformMessageEvent = {
    platform: 'feishu',
    conversationId: 'chat-1',
    conversationType: 'group',
    chatType: 'group',
    senderId: 'user-1',
    sender: { id: 'user-1', name: 'Test User' },
    content: 'hello',
    contentType: 'text',
    messageId: 'msg-1',
    timestamp: Date.now(),
  };

  it('非群聊消息不跳过', () => {
    const event = { ...baseEvent, chatType: 'p2p', conversationType: 'p2p' };
    expect(shouldSkipGroupMessage(event)).toBe(false);
  });

  it('GROUP_REQUIRE_MENTION=false 时不跳过', () => {
    // 模拟 GROUP_REQUIRE_MENTION=false 的环境
    const originalValue = process.env.GROUP_REQUIRE_MENTION;
    process.env.GROUP_REQUIRE_MENTION = 'false';

    const event = { ...baseEvent, mentions: undefined };
    expect(shouldSkipGroupMessage(event)).toBe(false);

    process.env.GROUP_REQUIRE_MENTION = originalValue;
  });

  it('GROUP_REQUIRE_MENTION=true 且无 mentions 时跳过', () => {
    const originalValue = process.env.GROUP_REQUIRE_MENTION;
    process.env.GROUP_REQUIRE_MENTION = 'true';

    const event = { ...baseEvent, mentions: undefined };
    expect(shouldSkipGroupMessage(event)).toBe(true);

    process.env.GROUP_REQUIRE_MENTION = originalValue;
  });

  it('GROUP_REQUIRE_MENTION=true 且 mentions 为空数组时跳过', () => {
    const originalValue = process.env.GROUP_REQUIRE_MENTION;
    process.env.GROUP_REQUIRE_MENTION = 'true';

    const event = { ...baseEvent, mentions: [] };
    expect(shouldSkipGroupMessage(event)).toBe(true);

    process.env.GROUP_REQUIRE_MENTION = originalValue;
  });

  describe('当提供 botOpenId 时', () => {
    beforeEach(() => {
      process.env.GROUP_REQUIRE_MENTION = 'true';
    });

    afterEach(() => {
      delete process.env.GROUP_REQUIRE_MENTION;
    });

    it('@ 了机器人时不跳过', () => {
      const event = {
        ...baseEvent,
        mentions: [{ id: { open_id: 'ou_bot_123' }, key: '@bot', name: 'Bot' }],
      };
      expect(shouldSkipGroupMessage(event, 'ou_bot_123')).toBe(false);
    });

    it('@ 了其他人（非机器人）时跳过', () => {
      const event = {
        ...baseEvent,
        mentions: [{ id: { open_id: 'ou_user_456' }, key: '@user', name: 'User' }],
      };
      expect(shouldSkipGroupMessage(event, 'ou_bot_123')).toBe(true);
    });

    it('@ 了多个人包括机器人时不跳过', () => {
      const event = {
        ...baseEvent,
        mentions: [
          { id: { open_id: 'ou_user_456' }, key: '@user', name: 'User' },
          { id: { open_id: 'ou_bot_123' }, key: '@bot', name: 'Bot' },
        ],
      };
      expect(shouldSkipGroupMessage(event, 'ou_bot_123')).toBe(false);
    });

    it('@ 了多个人但未包括机器人时跳过', () => {
      const event = {
        ...baseEvent,
        mentions: [
          { id: { open_id: 'ou_user_456' }, key: '@user1', name: 'User1' },
          { id: { open_id: 'ou_user_789' }, key: '@user2', name: 'User2' },
        ],
      };
      expect(shouldSkipGroupMessage(event, 'ou_bot_123')).toBe(true);
    });
  });

  describe('向后兼容', () => {
    beforeEach(() => {
      process.env.GROUP_REQUIRE_MENTION = 'true';
    });

    afterEach(() => {
      delete process.env.GROUP_REQUIRE_MENTION;
    });

    it('未提供 botOpenId 时，只要有 @ 就不跳过', () => {
      const event = {
        ...baseEvent,
        mentions: [{ id: { open_id: 'ou_user_456' }, key: '@user', name: 'User' }],
      };
      // 未提供 botOpenId，向后兼容：只要有 @ 就处理
      expect(shouldSkipGroupMessage(event)).toBe(false);
    });

    it('未提供 botOpenId 且无 @ 时跳过', () => {
      const event = { ...baseEvent, mentions: undefined };
      expect(shouldSkipGroupMessage(event)).toBe(true);
    });
  });
});
