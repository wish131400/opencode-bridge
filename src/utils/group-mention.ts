/**
 * 群聊 @ 提到检查工具
 *
 * 用于检查群聊消息是否需要 @ 提到才能触发响应
 */

import { groupConfig } from '../config.js';
import type { PlatformMessageEvent } from '../platform/types.js';

/**
 * 检查是否应该跳过群聊消息
 *
 * 当 GROUP_REQUIRE_MENTION=true 时，群聊中没有 @ 提到机器人的消息将被跳过
 *
 * @param event 平台消息事件
 * @param botOpenId 机器人的 open_id（可选，用于验证是否 @ 了机器人自己）
 * @returns 是否应该跳过该消息
 */
export function shouldSkipGroupMessage(event: PlatformMessageEvent, botOpenId?: string | null): boolean {
  // 非群聊消息不跳过
  if (event.chatType !== 'group') {
    return false;
  }

  // 未启用 @ 提到检查时不跳过
  if (!groupConfig.requireMentionInGroup) {
    return false;
  }

  // mentions 数组为空或不存在时跳过
  if (!Array.isArray(event.mentions) || event.mentions.length === 0) {
    return true;
  }

  // 如果提供了机器人 open_id，检查是否 @ 了机器人自己
  if (botOpenId) {
    const isBotMentioned = event.mentions.some(
      mention => mention.id?.open_id === botOpenId
    );
    // 只有 @ 了机器人才处理
    return !isBotMentioned;
  }

  // 未提供机器人 open_id 时，只要有 @ 就处理（向后兼容）
  return false;
}