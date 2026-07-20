(function () {
  "use strict";

  var CSV_URL = "https://docs.google.com/spreadsheets/d/13q8RiVyZ-pYP6HOpjmI2jpW5LK-pENGzy_WDXTrfAHg/export?format=csv&gid=1911672727";
  var QUESTIONS_URL = "questions.json";
  var RESET_STORAGE_KEY = "poll-reset-timestamp";

  var questionSelect = document.getElementById("question-select");
  var pollBody = document.getElementById("poll-body");
  var questionDisplay = document.getElementById("question-display");
  var pullBtn = document.getElementById("pull-btn");
  var answerBtn = document.getElementById("answer-btn");
  var resetBtn = document.getElementById("reset-btn");
  var sinceTimeEl = document.getElementById("since-time");
  var lastPulledEl = document.getElementById("last-pulled");
  var statusEl = document.getElementById("poll-status");
  var emptyEl = document.getElementById("poll-empty");
  var chartEl = document.getElementById("poll-chart");

  var questions = [];
  var currentQuestion = null;
  var revealed = false;
  var lastCounts = null;

  function formatDateTime(date) {
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function getResetTime() {
    var stored = localStorage.getItem(RESET_STORAGE_KEY);
    return stored ? new Date(stored) : null;
  }

  function renderSinceLabel() {
    var resetTime = getResetTime();
    sinceTimeEl.textContent = resetTime ? formatDateTime(resetTime) : "the beginning";
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

  function parseSheetTimestamp(value, order) {
    if (!value) return null;
    var m = value.trim().match(TIMESTAMP_RE);
    if (m) {
      var day = order === "DMY" ? parseInt(m[1], 10) : parseInt(m[2], 10);
      var month = order === "DMY" ? parseInt(m[2], 10) : parseInt(m[1], 10);
      var year = parseInt(m[3], 10);
      var hour = parseInt(m[4], 10);
      var minute = parseInt(m[5], 10);
      var second = m[6] ? parseInt(m[6], 10) : 0;
      var date = new Date(year, month - 1, day, hour, minute, second);
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

  // Renders the current question's options as horizontal bars. When `counts`
  // is null, no data has been pulled yet, so every bar is drawn empty.
  function renderChart(question, counts) {
    lastCounts = counts;
    clearChildren(chartEl);

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

    question.options.forEach(function (opt) {
      var count = counts ? (counts[opt.letter] || 0) : 0;
      var pct = counts ? (count / total) * 100 : 0;

      var isCorrect = revealed && opt.letter === question.correct;

      var row = document.createElement("div");
      row.className = "poll-bar-row" + (isCorrect ? " poll-bar-correct" : "");

      var label = document.createElement("div");
      label.className = "poll-bar-label";

      var letter = document.createElement("span");
      letter.className = "poll-bar-letter";
      letter.textContent = opt.letter;

      var text = document.createElement("span");
      text.className = "poll-bar-text";
      text.appendChild(renderRich(opt.text));

      label.appendChild(letter);
      label.appendChild(text);

      if (isCorrect) {
        var badge = document.createElement("span");
        badge.className = "poll-bar-correct-badge";
        badge.textContent = "✓ Correct";
        label.appendChild(badge);
      }

      var meter = document.createElement("div");
      meter.className = "poll-bar-meter";

      var track = document.createElement("div");
      track.className = "poll-bar-track";

      var fill = document.createElement("div");
      fill.className = "poll-bar-fill";
      fill.style.width = pct + "%";

      track.appendChild(fill);

      var value = document.createElement("span");
      value.className = "poll-bar-value";
      value.textContent = counts ? Math.round(pct) + "% (" + count + ")" : "–";

      meter.appendChild(track);
      meter.appendChild(value);

      row.appendChild(label);
      row.appendChild(meter);
      chartEl.appendChild(row);
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

        var counts = {};
        currentQuestion.options.forEach(function (opt) { counts[opt.letter] = 0; });

        dataRows.forEach(function (row) {
          var letter = normalizeToLetter(row[responseCol]);
          if (!letter || !(letter in counts)) return;

          if (resetTime) {
            var ts = parseSheetTimestamp(row[timestampCol], dateOrder);
            if (!ts || ts <= resetTime) return;
          }

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
    localStorage.setItem(RESET_STORAGE_KEY, new Date().toISOString());
    renderSinceLabel();
    lastPulledEl.textContent = "";
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
      option.textContent = truncate(stripRich(q.question), 55);
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
        questions = data;
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

  renderSinceLabel();
  init();
})();
