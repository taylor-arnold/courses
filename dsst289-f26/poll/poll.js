(function () {
  "use strict";

  var CSV_URL = "https://docs.google.com/spreadsheets/d/185UqVcq_12NqUmrI4HVtsDVwLs59BihzJh-PWIMCiCI/export?format=csv&gid=733069958";
  var QUESTIONS_URL = "questions.json";
  var RESET_STORAGE_KEY = "poll-reset-timestamp";
  var QUESTION_STORAGE_KEY = "poll-current-question-id";

  var questionSelect = document.getElementById("question-select");
  var questionDisplay = document.getElementById("question-display");
  var pullBtn = document.getElementById("pull-btn");
  var resetBtn = document.getElementById("reset-btn");
  var sinceTimeEl = document.getElementById("since-time");
  var lastPulledEl = document.getElementById("last-pulled");
  var statusEl = document.getElementById("poll-status");
  var emptyEl = document.getElementById("poll-empty");
  var chartEl = document.getElementById("poll-chart");
  var tableEl = document.getElementById("poll-table");
  var tableBody = document.getElementById("poll-table-body");

  var questions = [];
  var currentQuestion = null;

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

  // Google Forms writes timestamps in the form's locale, e.g. French
  // "15/07/2026 10:05:15" (DD/MM/YYYY). new Date() assumes MM/DD/YYYY and
  // silently returns Invalid Date whenever the day is > 12, so that format
  // needs to be parsed explicitly rather than handed to the Date constructor.
  function parseSheetTimestamp(value) {
    if (!value) return null;
    var m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var day = parseInt(m[1], 10);
      var month = parseInt(m[2], 10);
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

  // Renders the current question's options as horizontal bars. When `counts`
  // is null, no data has been pulled yet, so every bar is drawn empty.
  function renderChart(question, counts) {
    clearChildren(chartEl);
    clearChildren(tableBody);

    if (!question) {
      chartEl.hidden = true;
      emptyEl.hidden = false;
      tableEl.hidden = true;
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
      tableEl.hidden = true;
      return;
    }

    chartEl.hidden = false;
    emptyEl.hidden = true;
    tableEl.hidden = !counts;

    question.options.forEach(function (opt) {
      var count = counts ? (counts[opt.letter] || 0) : 0;
      var pct = counts ? (count / total) * 100 : 0;

      var row = document.createElement("div");
      row.className = "poll-bar-row";

      var label = document.createElement("div");
      label.className = "poll-bar-label";

      var letter = document.createElement("span");
      letter.className = "poll-bar-letter";
      letter.textContent = opt.letter;

      var text = document.createElement("span");
      text.className = "poll-bar-text";
      text.textContent = opt.text;

      label.appendChild(letter);
      label.appendChild(text);

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

      if (counts) {
        var tr = document.createElement("tr");

        var tdOption = document.createElement("td");
        tdOption.textContent = opt.letter + ". " + opt.text;

        var tdCount = document.createElement("td");
        tdCount.textContent = count;

        var tdPct = document.createElement("td");
        tdPct.textContent = pct.toFixed(1) + "%";

        tr.appendChild(tdOption);
        tr.appendChild(tdCount);
        tr.appendChild(tdPct);
        tableBody.appendChild(tr);
      }
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

        var counts = {};
        currentQuestion.options.forEach(function (opt) { counts[opt.letter] = 0; });

        dataRows.forEach(function (row) {
          var letter = normalizeToLetter(row[responseCol]);
          if (!letter || !(letter in counts)) return;

          if (resetTime) {
            var ts = parseSheetTimestamp(row[timestampCol]);
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

  function showQuestion(question) {
    currentQuestion = question;
    questionDisplay.textContent = question.question;
    renderChart(question, null);
  }

  function selectQuestion(id, resetOnSelect) {
    var question = questions.filter(function (q) { return q.id === id; })[0];
    if (!question) return;

    localStorage.setItem(QUESTION_STORAGE_KEY, id);
    questionSelect.value = id;

    if (resetOnSelect) {
      resetWindow();
      setStatus("New question selected. Poll window reset.", false);
    }

    showQuestion(question);
  }

  function populateSelect() {
    clearChildren(questionSelect);
    questions.forEach(function (q, i) {
      var option = document.createElement("option");
      option.value = q.id;
      option.textContent = "Q" + (i + 1) + ": " + q.question;
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

        var storedId = localStorage.getItem(QUESTION_STORAGE_KEY);
        var initialId = questions.some(function (q) { return q.id === storedId; })
          ? storedId
          : (questions[0] && questions[0].id);

        if (initialId) selectQuestion(initialId, false);
      })
      .catch(function (err) {
        setStatus("Could not load questions: " + err.message, true);
      });
  }

  questionSelect.addEventListener("change", function () {
    selectQuestion(questionSelect.value, true);
  });

  pullBtn.addEventListener("click", pull);
  resetBtn.addEventListener("click", reset);

  renderSinceLabel();
  init();
})();
