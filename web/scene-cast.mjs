// 席位模型名 → 自制角色；认不出返回 null，由场景回落到默认角色
// Claude 的模型经常只有档位名（opus / sonnet / haiku），没有厂家前缀，所以档位名一起列进来
export const vendorCharacters = [
  ['character-claude', ['claude', 'anthropic', 'opus', 'sonnet', 'haiku', 'fable']],
  ['character-gpt', ['gpt', 'openai', 'chatgpt', 'codex', 'o1', 'o3', 'o4']],
  ['character-gemini', ['gemini', 'google', 'gemma', 'bard']],
  ['character-grok', ['grok', 'xai']],
  ['character-deepseek', ['deepseek']],
  ['character-kimi', ['kimi', 'moonshot']],
  ['character-glm', ['glm', 'chatglm', 'zhipu']],
  ['character-qwen', ['qwen', 'tongyi']],
];

// 模型名可能写在 model、label 或席位 id 里，拆成词再按前缀比（gpt-5.6 和 "gpt5" 都能命中）
export function vendorCharacter(seat) {
  const tokens = [seat.model, seat.label, seat.id].filter(Boolean).join(' ').toLowerCase().split(/[^a-z0-9]+/);
  const vendor = vendorCharacters.find(([, keywords]) =>
    tokens.some(token => keywords.some(keyword => token.startsWith(keyword))));
  return vendor ? vendor[0] : null;
}
