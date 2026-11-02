import { t } from "./i18n";
import { useRef, useState } from "react";
import { emptyDay, type Day, type State } from "./domain";
import { adoptionMessage, adoptAction, continuation } from "./support";
import { EditableRow } from "./EditableRow";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Continuation } from "./Continuation";

export function Today({
  input,
  setInput,
  state,
  today,
  status,
  updateDay,
  onDirection,
  onPause,
}: {
  input: string;
  setInput: (value: string) => void;
  state: State;
  today: string;
  status: string;
  updateDay: (edit: (day: Day) => void, date?: string) => void;
  onDirection: () => void;
  onPause: () => void;
}) {
  const day = state.days[today] ?? emptyDay();
  const [feedback, setFeedback] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
      id: string;
      day: string;
      original: string;
    } | null>(null),
    [draft, setDraft] = useState("");
  const [reviewDate, setReviewDate] = useState<string | null>(null);
  const reviewDay = state.days[reviewDate ?? today] ?? emptyDay();
  const reviewStatus = t(`本次记录：${reviewDate ?? today} · ${t(status)}`);
  const onReviewEditingChange = (open: boolean) =>
    setReviewDate(open ? today : null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const choices = continuation(state, today);
  const focus = day.actions.find((a) => !a.done)?.id;
  function add(id: string, text: string) {
    let result: ReturnType<typeof adoptAction> = "empty";
    updateDay((d) => {
      result = adoptAction(d, id, text);
    });
    setFeedback(adoptionMessage(result));
    return result;
  }
  function finishEdit() {
    setEditing(null);
  }
  return (
    <>
      <button
        className="direction-summary"
        aria-label={
          state.direction.goal || state.direction.vision
            ? t("调整方向")
            : t("写下我的方向")
        }
        onClick={onDirection}
      >
        <span className="entry-icon">
          <Icon name="direction" />
        </span>
        <span>
          <small>{t("当前方向")}</small>
          <strong>
            {state.direction.vision ||
              state.direction.goal ||
              t("给今天留一个方向")}
          </strong>
          <span>{state.direction.project || t("方向可以慢慢清晰")}</span>
        </span>
        <Icon name="chevron" />
      </button>
      <section className="card actions support-actions">
        <div className="section-heading">
          <h2>{t("今天的一小步")}</h2>
        </div>
        {day.actions.length === 0 && (
          <p className="empty">{t("选一件值得做的小事，就可以开始。")}</p>
        )}
        <ul className="action-list">
          {day.actions.map((a) => (
            <li
              key={a.id}
              className={a.id === focus ? "current-action" : undefined}
            >
              <label>
                <input
                  type="checkbox"
                  checked={a.done}
                  onChange={() => {
                    updateDay((d) => {
                      const current = d.actions.find((x) => x.id === a.id);
                      if (current) current.done = !current.done;
                    });
                    setUndoId(a.done ? null : a.id);
                    setFeedback("");
                  }}
                />
                <span className={a.done ? "done" : ""}>{a.text}</span>
              </label>
              <button
                className="action-edit"
                aria-label={t(`修改行动：${a.text}`)}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setDraft(a.text);
                  setEditing({ id: a.id, day: today, original: a.text });
                }}
              >
                {t("修改")}
              </button>
            </li>
          ))}
        </ul>
        {undoId && day.actions.some((a) => a.id === undoId && a.done) && (
          <div className="completion-feedback" role="status">
            <span>{t("这一步已完成。")}</span>
            <button
              onClick={() => {
                updateDay((d) => {
                  const a = d.actions.find((a) => a.id === undoId);
                  if (a) a.done = false;
                });
                setUndoId(null);
              }}
            >
              {t("撤销完成")}
            </button>
          </div>
        )}
        <form
          className="action-form"
          onSubmit={(event) => {
            event.preventDefault();
            const result = add(crypto.randomUUID(), input);
            if (["added", "exists"].includes(result)) setInput("");
          }}
        >
          <label className="sr-only" htmlFor="action">
            {t("添加今天的行动")}
          </label>
          <input
            id="action"
            value={input}
            maxLength={300}
            disabled={day.actions.length >= 3}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              day.actions.length >= 3
                ? t("给这几件事留出空间")
                : day.actions.length
                  ? t("再加一件（可选）")
                  : t("例如：写出文章的第一个段落")
            }
          />
          <button
            type="submit"
            disabled={!input.trim() || day.actions.length >= 3}
          >
            {t("添加")}
          </button>
        </form>
        {feedback && (
          <p className="inline-feedback" role="status">
            {t(feedback)}
          </p>
        )}
      </section>
      <Continuation choices={choices} onAdopt={add} />
      <button
        className="pause-entry"
        onClick={onPause}
        aria-label={t("花一分钟，想一想")}
      >
        <span className="entry-icon">
          <Icon name="reflect" />
        </span>
        <span>
          <strong>{t("停顿一下")}</strong>
          <small>{t("看看此刻，不必留下答案")}</small>
        </span>
        <Icon name="chevron" />
      </button>
      <details className="support-disclosure daily-review">
        <summary>{t("留一句给明天")}</summary>
        <EditableRow
          status={reviewStatus}
          onEditingChange={onReviewEditingChange}
          label={t("明天，准备做什么小调整？")}
          value={reviewDay.evening.next}
          onChange={(value) =>
            updateDay((d) => {
              d.evening.next = value;
            }, reviewDate ?? today)
          }
        />
        <details className="support-disclosure">
          <summary>{t("也想记下今天的观察")}</summary>
          <EditableRow
            status={reviewStatus}
            onEditingChange={onReviewEditingChange}
            label={t("今天，什么行动有帮助？")}
            value={reviewDay.evening.worked}
            onChange={(value) =>
              updateDay((d) => {
                d.evening.worked = value;
              }, reviewDate ?? today)
            }
          />
          <EditableRow
            status={reviewStatus}
            onEditingChange={onReviewEditingChange}
            label={t("什么让行动变得困难？")}
            value={reviewDay.evening.obstacle}
            onChange={(value) =>
              updateDay((d) => {
                d.evening.obstacle = value;
              }, reviewDate ?? today)
            }
          />
        </details>
      </details>
      <Sheet
        open={editing !== null}
        title={t("修改行动")}
        onClose={finishEdit}
        opener={opener}
      >
        <p className="editor-status" role="status">
          {t(status)}
        </p>
        <label className="sr-only" htmlFor="edit-action">
          {t("行动")}
        </label>
        <textarea
          autoFocus
          id="edit-action"
          className="editor-input"
          maxLength={300}
          value={draft}
          onChange={(e) => {
            const value = e.target.value;
            setDraft(value);
            if (editing)
              updateDay((d) => {
                const action = d.actions.find((a) => a.id === editing.id);
                if (action) action.text = value.trim() || editing.original;
              }, editing.day);
          }}
        />
        {!draft.trim() && <p className="hint">{t("留空时保留原来的行动。")}</p>}
        <button
          className="quiet-remove"
          onClick={() => {
            updateDay((d) => {
              d.actions = d.actions.filter((a) => a.id !== editing?.id);
            }, editing?.day);
            setEditing(null);
          }}
        >
          {t("移除这项行动")}
        </button>
      </Sheet>
    </>
  );
}
