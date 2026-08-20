(function () {
  "use strict";

  var CSV_URL = "https://docs.google.com/spreadsheets/d/13q8RiVyZ-pYP6HOpjmI2jpW5LK-pENGzy_WDXTrfAHg/export?format=csv&gid=1911672727";
  var QUESTIONS_URL = "questions.json";
  var RESET_STORAGE_KEY = "poll-reset-timestamp";
  var RESET_HISTORY_KEY = "poll-reset-history";
  var DASH = "—";

  // A blank question that always sits at the top of the picker. Its stem and
  // options are just em dashes: type over them in place to run an ad hoc poll.
  var GENERAL_QUESTION = {
    id: "general",
    label: "General",
    question: DASH,
    options: ["A", "B", "C", "D"].map(function (letter) {
      return { letter: letter, text: DASH };
    })
  };

  var questionSelect = document.getElementById("question-select");
  var pollBody = document.getElementById("poll-body");
  var questionDisplay = document.getElementById("question-display");
  var pullBtn = document.getElementById("pull-btn");
  var answerBtn = document.getElementById("answer-btn");
  var resetBtn = document.getElementById("reset-btn");
  var undoBtn = document.getElementById("undo-btn");
  var sinceTimeEl = document.getElementById("since-time");
  var lastPulledEl = document.getElementById("last-pulled");
  var statusEl = document.getElementById("poll-status");
  var emptyEl = document.getElementById("poll-empty");
  var chartEl = document.getElementById("poll-chart");

  var questions = [];
  var currentQuestion = null;
  var revealed = false;
  var lastCounts = null;
  var chartRows = [];

  // ISO 8601 style (YYYY-MM-DD HH:MM), matching the datetime format taught in
  // the course, with a space separating date and time instead of T. Always shown
  // in New York time regardless of the browser's time zone.
  var DISPLAY_TIME_ZONE = "America/New_York";
  var dateTimeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  function formatDateTime(date) {
    var p = {};
    dateTimeParts.formatToParts(date).forEach(function (part) {
      p[part.type] = part.value;
    });
    return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second;
  }

  // Google Forms records timestamps as wall-clock times in the spreadsheet's
  // time zone (New York for this course), so we need the reverse of the
  // formatter above: turn New York wall-clock components into an absolute
  // instant. JS has no built-in for this, so we guess the instant as if the
  // components were UTC, measure the zone's offset at that guess, and correct.
  // A second pass catches guesses that straddle a DST transition.
  var zoneParts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  function zoneOffsetMs(utcMs) {
    var p = {};
    zoneParts.formatToParts(new Date(utcMs)).forEach(function (part) {
      p[part.type] = part.value;
    });
    var wallAsUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour), Number(p.minute), Number(p.second)
    );
    return wallAsUtc - utcMs;
  }

  function dateInDisplayZone(year, month, day, hour, minute, second) {
    var guess = Date.UTC(year, month - 1, day, hour, minute, second);
    var offset = zoneOffsetMs(guess);
    var result = guess - offset;
    var offsetAgain = zoneOffsetMs(result);
    if (offsetAgain !== offset) result = guess - offsetAgain;
    return new Date(result);
  }

  // Every reset pushes its timestamp onto a history stack kept in localStorage,
  // so an accidental reset can be undone by popping back to the previous
  // baseline (as many times as needed, down to "the beginning"). Only the last
  // entry is ever live; there is no redo, since a fresh reset just pushes anew.
  // Older pages stored a single timestamp under RESET_STORAGE_KEY, which is
  // folded into the stack the first time it is read.
  function getResetHistory() {
    var history = [];
    try {
      var stored = JSON.parse(localStorage.getItem(RESET_HISTORY_KEY) || "[]");
      if (Array.isArray(stored)) history = stored.filter(function (v) { return typeof v === "string"; });
    } catch (e) {
      history = [];
    }
    var legacy = localStorage.getItem(RESET_STORAGE_KEY);
    if (legacy) {
      if (history.indexOf(legacy) === -1) history.push(legacy);
      localStorage.removeItem(RESET_STORAGE_KEY);
      saveResetHistory(history);
    }
    return history;
  }

  function saveResetHistory(history) {
    localStorage.setItem(RESET_HISTORY_KEY, JSON.stringify(history));
  }

  function getResetTime() {
    var history = getResetHistory();
    return history.length ? new Date(history[history.length - 1]) : null;
  }

  function renderSinceLabel() {
    var resetTime = getResetTime();
    sinceTimeEl.textContent = resetTime ? formatDateTime(resetTime) : "the beginning";
    if (undoBtn) undoBtn.disabled = !resetTime;
  }

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return r.length > 1 || (r.length === 1 && r[0] !== "");
    });
  }

  // Any single letter is accepted here (not just A-E) so that questions with
  // more or fewer options than the current default set still parse correctly.
  function normalizeToLetter(value) {
    if (!value) return null;
    var cleaned = value.trim().toLowerCase().replace(/^option\s*/, "").trim();
    if (/^[a-z]$/i.test(cleaned)) return cleaned.toUpperCase();
    return null;
  }

  function findTimestampColumn(header) {
    for (var i = 0; i < header.length; i++) {
      if (/timestamp|horodateur/i.test(header[i])) return i;
    }
    return 0;
  }

  var TIMESTAMP_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

  // Google Forms writes timestamps in the form's locale, and the slash-separated
  // component order (DD/MM/YYYY vs MM/DD/YYYY) depends on that locale rather
  // than being fixed. new Date() assumes MM/DD/YYYY and silently returns
  // Invalid Date whenever the day is > 12, so we scan the column for a row
  // where one component is unambiguously > 12 to infer the real order before
  // parsing, instead of hardcoding one locale's format.
  function detectDateOrder(values) {
    for (var i = 0; i < values.length; i++) {
      var m = values[i] && values[i].trim().match(TIMESTAMP_RE);
      if (!m) continue;
      var first = parseInt(m[1], 10);
      var second = parseInt(m[2], 10);
      if (first > 12) return "DMY";
      if (second > 12) return "MDY";
    }
    return null;
  }

  // Sheets can also be set to write ISO-style timestamps (YYYY-MM-DD HH:MM:SS),
  // which have no ordering ambiguity. These still need the New York conversion:
  // handing the string to new Date() would read it in the browser's own zone.
  var ISO_TIMESTAMP_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

  function parseSheetTimestamp(value, order) {
    if (!value) return null;
    var iso = value.trim().match(ISO_TIMESTAMP_RE);
    if (iso) {
      var isoDate = dateInDisplayZone(
        parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10),
        parseInt(iso[4], 10), parseInt(iso[5], 10), iso[6] ? parseInt(iso[6], 10) : 0
      );
      return isNaN(isoDate.getTime()) ? null : isoDate;
    }
    var m = value.trim().match(TIMESTAMP_RE);
    if (m) {
      var day = order === "DMY" ? parseInt(m[1], 10) : parseInt(m[2], 10);
      var month = order === "DMY" ? parseInt(m[2], 10) : parseInt(m[1], 10);
      var year = parseInt(m[3], 10);
      var hour = parseInt(m[4], 10);
      var minute = parseInt(m[5], 10);
      var second = m[6] ? parseInt(m[6], 10) : 0;
      var date = dateInDisplayZone(year, month, day, hour, minute, second);
      return isNaN(date.getTime()) ? null : date;
    }
    var fallback = new Date(value);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function findResponseColumn(header, dataRows, timestampCol) {
    var bestCol = -1;
    var bestCount = 0;

    for (var col = 0; col < header.length; col++) {
      if (col === timestampCol) continue;
      var count = 0;
      for (var r = 0; r < dataRows.length; r++) {
        if (normalizeToLetter(dataRows[r][col]) !== null) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestCol = col;
      }
    }

    return bestCount > 0 ? bestCol : -1;
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // Question stems and option text may carry Markdown-style code: fenced
  // blocks delimited by triple backticks, and inline spans wrapped in single
  // backticks. renderRich turns those into <pre>/<code> nodes and leaves the
  // surrounding prose as plain text. Every node is built by hand (never
  // innerHTML), so author content in questions.json cannot inject markup.
  var FENCE_RE = /```[^\n]*\n([\s\S]*?)```/g;
  var INLINE_RE = /`([^`]+)`/g;

  function appendInline(parent, text) {
    var last = 0;
    var m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) {
        parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      var code = document.createElement("code");
      code.className = "poll-code-inline";
      code.textContent = m[1];
      parent.appendChild(code);
      last = INLINE_RE.lastIndex;
    }
    if (last < text.length) {
      parent.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  function renderRich(text) {
    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    FENCE_RE.lastIndex = 0;
    while ((m = FENCE_RE.exec(text)) !== null) {
      if (m.index > last) appendInline(frag, text.slice(last, m.index));
      var pre = document.createElement("pre");
      pre.className = "poll-code-block";
      var code = document.createElement("code");
      code.textContent = m[1].replace(/\n$/, "");
      pre.appendChild(code);
      frag.appendChild(pre);
      last = FENCE_RE.lastIndex;
    }
    if (last < text.length) appendInline(frag, text.slice(last));
    return frag;
  }

  // Plain-text reduction for the <option> labels, which cannot hold markup:
  // drop the fence and backtick markers and collapse whitespace to one line.
  function stripRich(text) {
    return text
      .replace(FENCE_RE, function (_, code) { return code; })
      .replace(INLINE_RE, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  // The question stem and every option label are editable in place so that a
  // question can be adjusted on the fly (or, for the General entry, written
  // from scratch). Edits live only in the DOM: selecting a question again or
  // pressing "Reset window" rebuilds it from questions.json. Pasted content is
  // flattened to plain text so no outside markup lands in the page.
  function makeEditable(el) {
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");
    el.classList.add("poll-editable");
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });
  }

  // Builds one bar row per option for `question`. The rows are created once
  // per question and reused by renderChart, which only updates the meters, so
  // in-place edits to the option text survive each pull.
  function buildChart(question) {
    clearChildren(chartEl);
    chartRows = [];

    question.options.forEach(function (opt) {
      var row = document.createElement("div");
      row.className = "poll-bar-row";

      var label = document.createElement("div");
      label.className = "poll-bar-label";

      var letter = document.createElement("span");
      letter.className = "poll-bar-letter";
      letter.textContent = opt.letter;

      var text = document.createElement("span");
      text.className = "poll-bar-text";
      text.appendChild(renderRich(opt.text));
      makeEditable(text);

      var badge = document.createElement("span");
      badge.className = "poll-bar-correct-badge";
      badge.textContent = "✓ Correct";
      badge.hidden = true;

      label.appendChild(letter);
      label.appendChild(text);
      label.appendChild(badge);

      var meter = document.createElement("div");
      meter.className = "poll-bar-meter";

      var track = document.createElement("div");
      track.className = "poll-bar-track";

      var fill = document.createElement("div");
      fill.className = "poll-bar-fill";
      fill.style.width = "0%";

      track.appendChild(fill);

      var value = document.createElement("span");
      value.className = "poll-bar-value";
      value.textContent = "–";

      meter.appendChild(track);
      meter.appendChild(value);

      row.appendChild(label);
      row.appendChild(meter);
      chartEl.appendChild(row);

      chartRows.push({ letter: opt.letter, row: row, badge: badge, fill: fill, value: value });
    });
  }

  // Updates the bars built by buildChart. When `counts` is null, no data has
  // been pulled yet, so every bar is drawn empty.
  function renderChart(question, counts) {
    lastCounts = counts;

    if (!question) {
      chartEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    var total = 0;
    if (counts) {
      question.options.forEach(function (opt) {
        total += counts[opt.letter] || 0;
      });
    }

    if (counts && total === 0) {
      chartEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    chartEl.hidden = false;
    emptyEl.hidden = true;

    chartRows.forEach(function (r) {
      var count = counts ? (counts[r.letter] || 0) : 0;
      var pct = counts ? (count / total) * 100 : 0;
      var isCorrect = revealed && r.letter === question.correct;

      r.row.classList.toggle("poll-bar-correct", isCorrect);
      r.badge.hidden = !isCorrect;
      r.fill.style.width = pct + "%";
      r.value.textContent = counts ? Math.round(pct) + "% (" + count + ")" : "–";
    });
  }

  function setStatus(message, isError) {
    var extra = statusEl.querySelector(".poll-error");
    if (extra) extra.remove();

    if (message) {
      var span = document.createElement("span");
      span.className = "poll-error";
      span.style.display = "block";
      span.style.color = isError ? "#b3261e" : "#888";
      span.style.marginTop = "0.2em";
      span.textContent = message;
      statusEl.appendChild(span);
    }
  }

  function pull() {
    if (!currentQuestion) return;

    pullBtn.disabled = true;
    pullBtn.textContent = "Pulling…";
    setStatus("");

    var url = CSV_URL + (CSV_URL.indexOf("?") === -1 ? "?" : "&") + "_=" + Date.now();

    fetch(url, { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Request failed with status " + resp.status);
        return resp.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        if (rows.length < 2) throw new Error("No data rows found in sheet.");

        var header = rows[0];
        var dataRows = rows.slice(1);
        var timestampCol = findTimestampColumn(header);
        var responseCol = findResponseColumn(header, dataRows, timestampCol);

        if (responseCol === -1) {
          throw new Error("Could not find a column with option responses.");
        }

        var resetTime = getResetTime();
        var dateOrder = detectDateOrder(dataRows.map(function (row) { return row[timestampCol]; })) || "MDY";

        // Rows stamped in the future can only come from a time zone mismatch
        // (e.g. rows written before the spreadsheet's zone was set to New York).
        // Left alone they sort after every reset and never drop out of the
        // window, so they are ignored. A few minutes of slack covers clock skew.
        var latestAllowed = Date.now() + 5 * 60 * 1000;

        var counts = {};
        currentQuestion.options.forEach(function (opt) { counts[opt.letter] = 0; });

        dataRows.forEach(function (row) {
          var letter = normalizeToLetter(row[responseCol]);
          if (!letter || !(letter in counts)) return;

          var ts = parseSheetTimestamp(row[timestampCol], dateOrder);
          if (ts && ts > latestAllowed) return;
          if (resetTime && (!ts || ts <= resetTime)) return;

          counts[letter]++;
        });

        renderChart(currentQuestion, counts);
        lastPulledEl.textContent = "Last pulled " + formatDateTime(new Date()) + ".";
      })
      .catch(function (err) {
        setStatus("Could not load results: " + err.message, true);
      })
      .finally(function () {
        pullBtn.disabled = false;
        pullBtn.textContent = "Pull results";
      });
  }

  function resetWindow() {
    var history = getResetHistory();
    history.push(new Date().toISOString());
    saveResetHistory(history);
    renderSinceLabel();
    lastPulledEl.textContent = "";
  }

  // Drops the most recent reset so the window opens from the previous baseline
  // again. The question text is left untouched (including any in-place edits);
  // only the bars are cleared, since they no longer match the window.
  function undoReset() {
    var history = getResetHistory();
    if (!history.length) return;
    history.pop();
    saveResetHistory(history);
    renderSinceLabel();
    lastPulledEl.textContent = "";
    if (currentQuestion) {
      revealed = false;
      renderChart(currentQuestion, null);
      updateAnswerButton();
    }
    var resetTime = getResetTime();
    setStatus(
      "Last reset undone. Window now starts at " +
        (resetTime ? formatDateTime(resetTime) : "the beginning") +
        ". Press “Pull results” to refresh.",
      false
    );
  }

  // The reveal button only makes sense for questions that carry a `correct`
  // answer; ungraded survey questions (no `correct` field) hide it entirely.
  function updateAnswerButton() {
    if (!answerBtn) return;
    var hasAnswer = !!(currentQuestion && currentQuestion.correct);
    answerBtn.hidden = !hasAnswer;
    answerBtn.disabled = revealed;
    answerBtn.textContent = revealed ? "Answer revealed" : "Reveal answer";
  }

  function showQuestion(question) {
    currentQuestion = question;
    revealed = false;
    clearChildren(questionDisplay);
    questionDisplay.appendChild(renderRich(question.question));
    makeEditable(questionDisplay);
    buildChart(question);
    renderChart(question, null);
    updateAnswerButton();
  }

  function revealAnswer() {
    if (!currentQuestion || !currentQuestion.correct) return;
    revealed = true;
    renderChart(currentQuestion, lastCounts);
    updateAnswerButton();
  }

  // Selecting a question always resets the poll window, since it marks the
  // start of a new question being asked live.
  function selectQuestion(id) {
    var question = questions.filter(function (q) { return q.id === id; })[0];

    if (!question) {
      currentQuestion = null;
      pollBody.hidden = true;
      return;
    }

    pollBody.hidden = false;
    resetWindow();
    setStatus("New question selected. Poll window reset.", false);
    showQuestion(question);
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + "…";
  }

  function populateSelect() {
    clearChildren(questionSelect);

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a question…";
    questionSelect.appendChild(placeholder);

    questions.forEach(function (q) {
      var option = document.createElement("option");
      option.value = q.id;
      option.textContent = q.label || truncate(stripRich(q.question), 55);
      questionSelect.appendChild(option);
    });
  }

  function reset() {
    resetWindow();
    setStatus("Window reset. Press “Pull results” to see responses from now on.", false);
    if (currentQuestion) showQuestion(currentQuestion);
  }

  function init() {
    fetch(QUESTIONS_URL, { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Request failed with status " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        questions = [GENERAL_QUESTION].concat(data);
        populateSelect();
      })
      .catch(function (err) {
        setStatus("Could not load questions: " + err.message, true);
      });
  }

  questionSelect.addEventListener("change", function () {
    selectQuestion(questionSelect.value);
  });

  pullBtn.addEventListener("click", pull);
  if (answerBtn) answerBtn.addEventListener("click", revealAnswer);
  resetBtn.addEventListener("click", reset);
  if (undoBtn) undoBtn.addEventListener("click", undoReset);

  renderSinceLabel();
  init();
})();
