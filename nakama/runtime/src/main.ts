/** @noSelfInFile */

interface TicMarks {
  [userId: string]: string;
}

interface TicState extends nkruntime.MatchState {
  board: string[];
  phase: string;
  playerIds: string[];
  marks: TicMarks;
  currentTurnUserId: string;
  winnerUserId: string;
  draw: boolean;
  leaveReason: string;
  roomSource: string;
  timedMode: boolean;
  turnSeconds: number;
  deadlineTick: number;
  turnDeadlineUnix: number;
  outcomeRecorded: boolean;
}

var OP_STATE = 1;
var OP_MOVE = 2;
/** Client asks for a fresh authoritative snapshot (covers missed join broadcasts). */
var OP_SYNC = 3;
var TICK_RATE = 5;

var LB_WINS = "tic_wins";
var LB_LOSSES = "tic_losses";
var LB_RATING = "tic_rating";
var STATS_COLLECTION = "tic_stats";
var STATS_KEY = "profile";
var LOG_COLLECTION = "tic_match_log";

function emptyBoard(): string[] {
  return ["", "", "", "", "", "", "", "", ""];
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function ensureLeaderboards(logger: nkruntime.Logger, nk: nkruntime.Nakama): void {
  try {
    nk.leaderboardCreate(
      LB_WINS,
      true,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      null,
      null,
      true,
    );
  } catch (e) {
    logger.debug("tic_tac_toe leaderboardCreate wins: %s", String(e));
  }
  try {
    nk.leaderboardCreate(
      LB_LOSSES,
      true,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      null,
      null,
      true,
    );
  } catch (e) {
    logger.debug("tic_tac_toe leaderboardCreate losses: %s", String(e));
  }
  try {
    nk.leaderboardCreate(
      LB_RATING,
      true,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      null,
      null,
      true,
    );
  } catch (e) {
    logger.debug("tic_tac_toe leaderboardCreate rating: %s", String(e));
  }
}

interface TicProfile {
  currentStreak: number;
  bestStreak: number;
  lastResult: string;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  version?: string;
}

function readTicProfile(nk: nkruntime.Nakama, userId: string): TicProfile {
  var res = nk.storageRead([
    { collection: STATS_COLLECTION, key: STATS_KEY, userId: userId },
  ]);
  if (!res || res.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastResult: "",
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
    };
  }
  var o = res[0];
  var v = o.value || {};
  return {
    currentStreak: typeof v.currentStreak === "number" ? v.currentStreak : 0,
    bestStreak: typeof v.bestStreak === "number" ? v.bestStreak : 0,
    lastResult: typeof v.lastResult === "string" ? v.lastResult : "",
    totalWins: typeof v.totalWins === "number" ? v.totalWins : 0,
    totalLosses: typeof v.totalLosses === "number" ? v.totalLosses : 0,
    totalDraws: typeof v.totalDraws === "number" ? v.totalDraws : 0,
    version: o.version,
  };
}

function writeTicProfile(nk: nkruntime.Nakama, userId: string, p: TicProfile): void {
  var w: nkruntime.StorageWriteRequest = {
    collection: STATS_COLLECTION,
    key: STATS_KEY,
    userId: userId,
    value: {
      currentStreak: p.currentStreak,
      bestStreak: p.bestStreak,
      lastResult: p.lastResult,
      totalWins: p.totalWins,
      totalLosses: p.totalLosses,
      totalDraws: p.totalDraws,
    },
  };
  if (p.version) {
    w.version = p.version;
  }
  nk.storageWrite([w]);
}

function ratingDeltaWrite(
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  userId: string,
  delta: number,
): void {
  try {
    nk.leaderboardRecordWrite(
      LB_RATING,
      userId,
      undefined,
      delta,
      0,
      undefined,
      nkruntime.OverrideOperator.INCREMENTAL,
    );
  } catch (e) {
    logger.warn("tic_tac_toe rating incr userId=%s delta=%d: %s", userId, delta, String(e));
    try {
      var list = nk.leaderboardRecordsList(LB_RATING, [userId], 1);
      var rows = list.ownerRecords || list.records || [];
      var cur = rows.length > 0 ? Number(rows[0].score || 0) : 0;
      var next = cur + delta;
      if (next < 0) {
        next = 0;
      }
      nk.leaderboardRecordWrite(
        LB_RATING,
        userId,
        undefined,
        next,
        0,
        undefined,
        nkruntime.OverrideOperator.SET,
      );
    } catch (e2) {
      logger.warn("tic_tac_toe rating set fallback: %s", String(e2));
    }
  }
}

function appendMatchLog(
  nk: nkruntime.Nakama,
  userId: string,
  opponentId: string,
  result: string,
  matchId: string,
  finishedAt: number,
): void {
  var mid = matchId.replace(/[^a-zA-Z0-9]/g, "_");
  if (mid.length > 48) {
    mid = mid.slice(-48);
  }
  var key = String(finishedAt) + "_" + mid;
  nk.storageWrite([
    {
      collection: LOG_COLLECTION,
      key: key,
      userId: userId,
      value: {
        opponent_id: opponentId,
        result: result,
        finished_at: finishedAt,
        match_id: matchId,
      },
    },
  ]);
}

function recordDraw(
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  s: TicState,
  matchId: string,
): void {
  var ts = nowUnix();
  var a = s.playerIds[0];
  var b = s.playerIds[1];
  if (!a || !b) {
    logger.warn("tic_tac_toe recordDraw skip: need two playerIds");
    return;
  }
  var pa = readTicProfile(nk, a);
  var pb = readTicProfile(nk, b);
  pa.totalDraws += 1;
  pa.currentStreak = 0;
  pa.lastResult = "draw";
  pb.totalDraws += 1;
  pb.currentStreak = 0;
  pb.lastResult = "draw";
  writeTicProfile(nk, a, pa);
  writeTicProfile(nk, b, pb);
  appendMatchLog(nk, a, b, "draw", matchId, ts);
  appendMatchLog(nk, b, a, "draw", matchId, ts);
}

function recordWinLoss(
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  winnerId: string,
  loserId: string,
  matchId: string,
): void {
  try {
    nk.leaderboardRecordWrite(
      LB_WINS,
      winnerId,
      undefined,
      1,
      0,
      undefined,
      nkruntime.OverrideOperator.INCREMENTAL,
    );
  } catch (e) {
    logger.warn("tic_tac_toe leaderboard win write: %s", String(e));
  }
  try {
    nk.leaderboardRecordWrite(
      LB_LOSSES,
      loserId,
      undefined,
      1,
      0,
      undefined,
      nkruntime.OverrideOperator.INCREMENTAL,
    );
  } catch (e) {
    logger.warn("tic_tac_toe leaderboard loss write: %s", String(e));
  }
  ratingDeltaWrite(logger, nk, winnerId, 4);
  ratingDeltaWrite(logger, nk, loserId, -1);

  var ws = readTicProfile(nk, winnerId);
  var cur = ws.lastResult === "win" ? ws.currentStreak + 1 : 1;
  var best = cur > ws.bestStreak ? cur : ws.bestStreak;
  ws.currentStreak = cur;
  ws.bestStreak = best;
  ws.lastResult = "win";
  ws.totalWins += 1;
  writeTicProfile(nk, winnerId, ws);

  var ls = readTicProfile(nk, loserId);
  ls.currentStreak = 0;
  ls.lastResult = "loss";
  ls.totalLosses += 1;
  writeTicProfile(nk, loserId, ls);

  var ts = nowUnix();
  appendMatchLog(nk, winnerId, loserId, "win", matchId, ts);
  appendMatchLog(nk, loserId, winnerId, "loss", matchId, ts);
}

function applyOutcomeIfNeeded(
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  s: TicState,
  matchId: string,
  loserIdForWin?: string,
): void {
  if (s.outcomeRecorded || s.phase !== "finished") {
    return;
  }
  s.outcomeRecorded = true;
  if (s.draw) {
    recordDraw(logger, nk, s, matchId);
    return;
  }
  if (!s.winnerUserId) {
    return;
  }
  var loser = loserIdForWin || otherPlayer(s.playerIds, s.winnerUserId);
  if (!loser || loser === s.winnerUserId) {
    return;
  }
  recordWinLoss(logger, nk, s.winnerUserId, loser, matchId);
}

function broadcastSnapshot(
  logger: nkruntime.Logger,
  dispatcher: nkruntime.MatchDispatcher,
  state: TicState,
): void {
  var payload = JSON.stringify({
    board: state.board,
    phase: state.phase,
    currentTurnUserId: state.currentTurnUserId,
    winnerUserId: state.winnerUserId,
    draw: state.draw,
    marks: state.marks,
    leaveReason: state.leaveReason,
    roomSource: state.roomSource,
    timedMode: state.timedMode,
    turnSeconds: state.turnSeconds,
    turnDeadlineUnix: state.turnDeadlineUnix,
    serverTickRate: TICK_RATE,
  });
  logger.debug(
    "tic_tac_toe broadcast op=%d phase=%s turn=%s bytes=%d",
    OP_STATE,
    state.phase,
    state.currentTurnUserId || "—",
    payload.length,
  );
  dispatcher.broadcastMessage(OP_STATE, payload, null, null, true);
}

function checkWinMark(board: string[]): string {
  var lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (var i = 0; i < lines.length; i++) {
    var a = lines[i][0];
    var b = lines[i][1];
    var c = lines[i][2];
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return "";
}

function boardFull(board: string[]): boolean {
  for (var i = 0; i < board.length; i++) {
    if (board[i] === "") {
      return false;
    }
  }
  return true;
}

function userIdForMark(marks: TicMarks, mark: string): string {
  for (var uid in marks) {
    if (marks.hasOwnProperty(uid) && marks[uid] === mark) {
      return uid;
    }
  }
  return "";
}

function otherPlayer(playerIds: string[], uid: string): string {
  for (var i = 0; i < playerIds.length; i++) {
    if (playerIds[i] !== uid) {
      return playerIds[i];
    }
  }
  return uid;
}

function playerIndex(playerIds: string[], uid: string): number {
  for (var i = 0; i < playerIds.length; i++) {
    if (playerIds[i] === uid) {
      return i;
    }
  }
  return -1;
}

function resetTurnDeadline(s: TicState, tick: number): void {
  if (!s.timedMode) {
    s.deadlineTick = 0;
    s.turnDeadlineUnix = 0;
    return;
  }
  s.deadlineTick = tick + s.turnSeconds * TICK_RATE;
  s.turnDeadlineUnix = nowUnix() + s.turnSeconds;
}

function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: any },
): { state: TicState; tickRate: number; label: string } {
  var source =
    params && params.source === "private" ? "private" : "matchmaker";
  var timed = !!(params && params.timed === true);
  var turnSec = 30;
  if (params && typeof params.turnSeconds === "number" && params.turnSeconds > 0) {
    turnSec = Math.floor(params.turnSeconds);
  }
  var state: TicState = {
    board: emptyBoard(),
    phase: "waiting",
    playerIds: [],
    marks: {},
    currentTurnUserId: "",
    winnerUserId: "",
    draw: false,
    leaveReason: "",
    roomSource: source,
    timedMode: timed,
    turnSeconds: turnSec,
    deadlineTick: 0,
    turnDeadlineUnix: 0,
    outcomeRecorded: false,
  };
  logger.info(
    "tic_tac_toe matchInit tickRate=%d label=tic_tac_toe matchId=%s source=%s timed=%s",
    TICK_RATE,
    ctx.matchId || "n/a",
    source,
    String(timed),
  );
  return { state: state, tickRate: TICK_RATE, label: "tic_tac_toe" };
}

function matchJoinAttempt(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any },
): { state: TicState; accept: boolean; rejectMessage?: string } | null {
  var uid = presence.userId;
  if (playerIndex(state.playerIds, uid) >= 0) {
    logger.debug(
      "tic_tac_toe joinAttempt accept rejoin userId=%s username=%s",
      uid,
      presence.username || "—",
    );
    return { state: state, accept: true };
  }
  if (state.playerIds.length >= 2) {
    logger.warn(
      "tic_tac_toe joinAttempt reject full userId=%s username=%s",
      uid,
      presence.username || "—",
    );
    return { state: state, accept: false, rejectMessage: "match full" };
  }
  logger.info(
    "tic_tac_toe joinAttempt accept userId=%s username=%s seat=%d",
    uid,
    presence.username || "—",
    state.playerIds.length,
  );
  return { state: state, accept: true };
}

function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  presences: nkruntime.Presence[],
): { state: TicState } | null {
  var s = state;
  for (var i = 0; i < presences.length; i++) {
    var uid = presences[i].userId;
    if (playerIndex(s.playerIds, uid) < 0) {
      s.playerIds.push(uid);
      logger.info(
        "tic_tac_toe matchJoin userId=%s username=%s totalPlayers=%d phase=%s",
        uid,
        presences[i].username || "—",
        s.playerIds.length,
        s.phase,
      );
    }
  }
  if (s.phase === "waiting" && s.playerIds.length >= 2) {
    s.marks[s.playerIds[0]] = "X";
    s.marks[s.playerIds[1]] = "O";
    s.phase = "playing";
    s.currentTurnUserId = s.playerIds[0];
    resetTurnDeadline(s, tick);
    logger.info(
      "tic_tac_toe gameStart X=%s O=%s firstTurn=%s",
      s.playerIds[0],
      s.playerIds[1],
      s.currentTurnUserId,
    );
  }
  // Always broadcast after joins so clients in "waiting" get a snapshot (not only when 2P starts).
  broadcastSnapshot(logger, dispatcher, s);
  return { state: s };
}

function matchLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  presences: nkruntime.Presence[],
): { state: TicState } | null {
  var s = state;
  var left: { [k: string]: boolean } = {};
  for (var i = 0; i < presences.length; i++) {
    left[presences[i].userId] = true;
    logger.info(
      "tic_tac_toe matchLeave userId=%s username=%s",
      presences[i].userId,
      presences[i].username || "—",
    );
  }
  var remaining: string[] = [];
  for (var j = 0; j < s.playerIds.length; j++) {
    var pid = s.playerIds[j];
    if (!left[pid]) {
      remaining.push(pid);
    }
  }
  if (
    s.phase === "playing" &&
    s.winnerUserId === "" &&
    !s.draw &&
    remaining.length === 1
  ) {
    var winnerId = remaining[0];
    var loserId = "";
    for (var lid in left) {
      if (left.hasOwnProperty(lid) && playerIndex(s.playerIds, lid) >= 0 && lid !== winnerId) {
        loserId = lid;
        break;
      }
    }
    s.winnerUserId = winnerId;
    s.phase = "finished";
    s.leaveReason = "opponent_left";
    logger.info(
      "tic_tac_toe forfeitWin winner=%s remainingCount=%d",
      s.winnerUserId,
      remaining.length,
    );
    applyOutcomeIfNeeded(
      logger,
      nk,
      s,
      ctx.matchId || "",
      loserId || undefined,
    );
    broadcastSnapshot(logger, dispatcher, s);
  }
  return { state: s };
}

function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  messages: nkruntime.MatchMessage[],
): { state: TicState } | null {
  var s = state;

  if (
    s.timedMode &&
    s.phase === "playing" &&
    s.deadlineTick > 0 &&
    tick >= s.deadlineTick
  ) {
    var timedOutUid = s.currentTurnUserId;
    s.winnerUserId = otherPlayer(s.playerIds, timedOutUid);
    s.phase = "finished";
    s.leaveReason = "timeout";
    logger.info(
      "tic_tac_toe gameOver timeout loser=%s winner=%s",
      timedOutUid,
      s.winnerUserId,
    );
    applyOutcomeIfNeeded(
      logger,
      nk,
      s,
      ctx.matchId || "",
      timedOutUid,
    );
    broadcastSnapshot(logger, dispatcher, s);
    return { state: s };
  }

  if (messages.length > 0) {
    logger.debug(
      "tic_tac_toe matchLoop tick=%d inboundMsgs=%d phase=%s",
      tick,
      messages.length,
      s.phase,
    );
  }
  for (var m = 0; m < messages.length; m++) {
    var msg = messages[m];
    if (msg.opCode === OP_SYNC) {
      broadcastSnapshot(logger, dispatcher, s);
      continue;
    }
    if (msg.opCode !== OP_MOVE) {
      logger.debug(
        "tic_tac_toe matchLoop skip opCode=%d (want move=%d)",
        msg.opCode,
        OP_MOVE,
      );
      continue;
    }
    var payload: { row?: number; col?: number } = {};
    try {
      payload = JSON.parse(nk.binaryToString(msg.data));
    } catch (e) {
      logger.warn("tic_tac_toe matchLoop invalid move JSON from %s", msg.sender.userId);
      continue;
    }
    if (s.phase !== "playing") {
      logger.debug("tic_tac_toe matchLoop ignore move phase=%s", s.phase);
      continue;
    }
    var uid = msg.sender.userId;
    if (uid !== s.currentTurnUserId) {
      logger.debug(
        "tic_tac_toe matchLoop wrong turn sender=%s current=%s",
        uid,
        s.currentTurnUserId,
      );
      continue;
    }
    var row = payload.row;
    var col = payload.col;
    if (typeof row !== "number" || typeof col !== "number") {
      logger.debug("tic_tac_toe matchLoop bad row/col types");
      continue;
    }
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      logger.debug("tic_tac_toe matchLoop out of bounds row=%d col=%d", row, col);
      continue;
    }
    var idx = row * 3 + col;
    if (s.board[idx] !== "") {
      logger.debug("tic_tac_toe matchLoop cell occupied idx=%d", idx);
      continue;
    }
    var mark = s.marks[uid];
    if (!mark) {
      logger.warn("tic_tac_toe matchLoop no mark for userId=%s", uid);
      continue;
    }
    s.board[idx] = mark;
    logger.info(
      "tic_tac_toe move userId=%s mark=%s row=%d col=%d idx=%d",
      uid,
      mark,
      row,
      col,
      idx,
    );
    var w = checkWinMark(s.board);
    if (w) {
      s.winnerUserId = userIdForMark(s.marks, w);
      s.phase = "finished";
      logger.info("tic_tac_toe gameOver win winnerUserId=%s mark=%s", s.winnerUserId, w);
      applyOutcomeIfNeeded(logger, nk, s, ctx.matchId || "");
      broadcastSnapshot(logger, dispatcher, s);
      return { state: s };
    }
    if (boardFull(s.board)) {
      s.draw = true;
      s.phase = "finished";
      logger.info("tic_tac_toe gameOver draw");
      applyOutcomeIfNeeded(logger, nk, s, ctx.matchId || "");
      broadcastSnapshot(logger, dispatcher, s);
      return { state: s };
    }
    s.currentTurnUserId = otherPlayer(s.playerIds, uid);
    resetTurnDeadline(s, tick);
    logger.info("tic_tac_toe nextTurn userId=%s", s.currentTurnUserId);
    broadcastSnapshot(logger, dispatcher, s);
  }
  return { state: s };
}

function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  graceSeconds: number,
): { state: TicState } | null {
  return null;
}

function matchSignal(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicState,
  data: string,
): { state: TicState; data?: string } | null {
  return null;
}

function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[],
): string | void {
  logger.info(
    "tic_tac_toe matchmakerMatched partySize=%d",
    matches.length,
  );
  // Timed match only if every party queued as timed (classic uses mode: classic).
  var timed =
    matches.length > 0 &&
    matches.every(function (p) {
      return (p.properties || {}).mode === "timed";
    });
  for (var i = 0; i < matches.length; i++) {
    var p = matches[i];
    logger.info(
      "tic_tac_toe matchmakerMatched[%d] userId=%s username=%s sessionId=%s mode=%s",
      i,
      p.presence.userId,
      p.presence.username || "—",
      p.presence.sessionId || "—",
      String((p.properties || {}).mode || "—"),
    );
  }
  var matchId = nk.matchCreate("tic_tac_toe", {
    source: "matchmaker",
    timed: timed,
    turnSeconds: 30,
  });
  logger.info("tic_tac_toe matchCreate -> %s timed=%s", matchId, String(timed));
  return matchId;
}

function rpcTicPlayerStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    return JSON.stringify({ error: "Unauthorized" });
  }
  var st = readTicProfile(nk, ctx.userId);
  return JSON.stringify({
    current_streak: st.currentStreak,
    best_streak: st.bestStreak,
    last_result: st.lastResult,
    total_wins: st.totalWins,
    total_losses: st.totalLosses,
    total_draws: st.totalDraws,
  });
}

function rpcTicStatistics(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    return JSON.stringify({ error: "Unauthorized" });
  }
  var uid = ctx.userId;
  var p = readTicProfile(nk, uid);

  var rating = 0;
  var rank = 0;
  try {
    var lr = nk.leaderboardRecordsList(LB_RATING, [uid], 1);
    var or = lr.ownerRecords;
    if (!or || or.length === 0) {
      or = lr.records;
    }
    if (or && or.length > 0) {
      rating = Number(or[0].score || 0);
      rank = Number(or[0].rank || 0);
    }
  } catch (e) {
    logger.debug("tic_statistics rating: %s", String(e));
  }

  var history: {
    opponent_id: string;
    result: string;
    finished_at: number;
    match_id: string;
  }[] = [];
  try {
    var sl = nk.storageList(uid, LOG_COLLECTION, 100, undefined, uid);
    var objs = sl.objects || [];
    for (var i = 0; i < objs.length; i++) {
      var val = objs[i].value || {};
      history.push({
        opponent_id: typeof val.opponent_id === "string" ? val.opponent_id : "",
        result: typeof val.result === "string" ? val.result : "",
        finished_at:
          typeof val.finished_at === "number" ? val.finished_at : 0,
        match_id: typeof val.match_id === "string" ? val.match_id : "",
      });
    }
    history.sort(function (a, b) {
      return b.finished_at - a.finished_at;
    });
    if (history.length > 50) {
      history = history.slice(0, 50);
    }
  } catch (e2) {
    logger.debug("tic_statistics history: %s", String(e2));
  }

  return JSON.stringify({
    total_wins: p.totalWins,
    total_losses: p.totalLosses,
    total_draws: p.totalDraws,
    current_streak: p.currentStreak,
    best_streak: p.bestStreak,
    last_result: p.lastResult,
    rating: rating,
    rank: rank,
    history: history,
  });
}

function rpcCreateTicRoom(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    return JSON.stringify({ error: "Unauthorized" });
  }
  var body: { timed?: boolean; turnSeconds?: number } = {};
  if (payload && payload.length > 0) {
    try {
      body = JSON.parse(payload);
    } catch (e) {
      return JSON.stringify({ error: "Invalid JSON payload" });
    }
  }
  var timed = body.timed === true;
  var turnSec = 30;
  if (typeof body.turnSeconds === "number" && body.turnSeconds > 0) {
    turnSec = Math.floor(body.turnSeconds);
  }
  var matchId = nk.matchCreate("tic_tac_toe", {
    source: "private",
    timed: timed,
    turnSeconds: turnSec,
  });
  logger.info("tic_tac_toe rpc create_tic_room userId=%s matchId=%s", ctx.userId, matchId);
  return JSON.stringify({ match_id: matchId });
}

var InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  ensureLeaderboards(logger, nk);
  logger.info("tic_tac_toe InitModule: register match, RPC, matchmakerMatched");
  initializer.registerRpc("tic_player_stats", rpcTicPlayerStats);
  initializer.registerRpc("tic_statistics", rpcTicStatistics);
  initializer.registerRpc("create_tic_room", rpcCreateTicRoom);
  initializer.registerMatchmakerMatched(matchmakerMatched);
  initializer.registerMatch("tic_tac_toe", {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });
};
