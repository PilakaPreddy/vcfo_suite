/**
 * The route one chat message took, cheapest first. It is stored on `ask_messages.path` and on
 * `ask_usage_daily.path`; the token report groups by it and `ASK_KILL_PATHS` switches one off.
 *
 * suggestion, context, metric_local, topic_local, greeting_local and saved_answer call no model.
 * router_* answers spent only the router call. document_answer and tool_answer spent the router
 * and one answer call. fixed_workflow and agent_run belong to the Do engine, watch to Watch.
 * ingest is no chat message: it is what indexing a source spends, reported beside the rest.
 */
export const ASK_PATHS = [
  'suggestion',
  'context',
  'greeting_local',
  'metric_local',
  'topic_local',
  'saved_answer',
  'router_refusal',
  'router_topic',
  'router_metric',
  'document_answer',
  'tool_answer',
  'fixed_workflow',
  'agent_run',
  'watch',
  'ingest',
] as const;
export type AskPath = (typeof ASK_PATHS)[number];

/** What the router may return. `fact` and `do_work` are new; the other seven are today's guard. */
export const ROUTER_INTENTS = [
  'explain',
  'project_status',
  'ops_query',
  'decision_request',
  'greeting',
  'off_topic',
  'unsafe',
  'fact',
  'do_work',
] as const;
export type RouterIntent = (typeof ROUTER_INTENTS)[number];
