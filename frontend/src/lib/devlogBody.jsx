import { Fragment } from "react";

/* Devlog bodies, formatted.
 *
 * The feed used to print the body as flat paragraphs, so a post written in the
 * house style — "# swats.bio devlog:" then quoted lines — showed the # and > as
 * literal characters. This adds exactly the constructs the devlog is written
 * with, and nothing more:
 *
 *   #  /  ##  heading            (the post title is already the h2)
 *   >  quoted line              (callouts: the line that actually matters)
 *   -  or  *  list              /  1. ordered list
 *   **bold**, `code`, [text](https://…) and bare links inline
 *
 * Still plain text, never HTML: everything below builds React elements, so a
 * body pasted from anywhere cannot inject markup into a public page.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;

export function parseDevlogBlocks(body) {
  const blocks = [];
  let current = null;

  const flush = () => {
    if (current && current.lines.some((l) => l.trim())) blocks.push(current);
    current = null;
  };
  const start = (type, extra, line) => {
    flush();
    current = { type, ...extra, lines: [line] };
  };

  for (const raw of String(body ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, lines: [heading[2].trim()] });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      if (current?.type === "quote") current.lines.push(quote[1]);
      else start("quote", {}, quote[1]);
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (current?.type === "list" && !current.ordered) current.lines.push(bullet[1]);
      else start("list", { ordered: false }, bullet[1]);
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      if (current?.type === "list" && current.ordered) current.lines.push(ordered[1]);
      else start("list", { ordered: true }, ordered[1]);
      continue;
    }

    // A plain line continues the paragraph it is in, keeping its own line break.
    if (current?.type === "paragraph") current.lines.push(line);
    else start("paragraph", {}, line);
  }

  flush();
  return blocks;
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>()]+)/g;

export function renderInline(text, keyPrefix = "i") {
  const parts = String(text ?? "").split(INLINE);

  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono2 text-[0.85em] text-brand-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-brand-300 underline decoration-brand-400/40 underline-offset-2 transition-colors hover:text-brand-200">
          {link[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noreferrer noopener" className="text-brand-300 underline decoration-brand-400/40 underline-offset-2 transition-colors hover:text-brand-200">
          {part}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const HEADING_CLASS = {
  1: "mt-6 font-display text-lg font-extrabold tracking-tight text-zinc-50",
  2: "mt-5 font-display text-base font-bold tracking-tight text-zinc-100",
  3: "mt-4 text-sm font-bold text-zinc-200",
};

export function renderDevlogBody(body) {
  return parseDevlogBlocks(body).map((block, i) => {
    const key = `block-${i}`;

    if (block.type === "heading") {
      const className = HEADING_CLASS[block.level] || HEADING_CLASS[2];
      const Tag = block.level <= 2 ? "h3" : "h4";
      return (
        <Tag key={key} className={className} data-devlog-block="heading">
          {renderInline(block.lines[0], key)}
        </Tag>
      );
    }

    if (block.type === "quote") {
      return (
        <blockquote
          key={key}
          data-devlog-block="quote"
          className="mt-4 rounded-r-xl border-l-2 border-brand-400/70 bg-gradient-to-r from-brand-500/[0.09] to-transparent py-2.5 pl-4 pr-3 text-sm italic leading-relaxed text-zinc-200"
        >
          {block.lines.map((line, j) => (
            <Fragment key={`${key}-${j}`}>
              {j > 0 && <br />}
              {renderInline(line, `${key}-${j}`)}
            </Fragment>
          ))}
        </blockquote>
      );
    }

    if (block.type === "list") {
      const Tag = block.ordered ? "ol" : "ul";
      // Ordered lists keep their own markers, so they stay plain <li>; the
      // unordered ones draw a brand dot instead of the browser's disc.
      return (
        <Tag
          key={key}
          data-devlog-block="list"
          className={`mt-3 space-y-1.5 text-sm leading-relaxed text-zinc-300 ${block.ordered ? "list-decimal pl-5" : "pl-1"}`}
        >
          {block.lines.map((line, j) => (
            <li key={`${key}-${j}`} className={block.ordered ? "pl-1" : "flex gap-2"}>
              {!block.ordered && <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400/80" aria-hidden="true" />}
              <span>{renderInline(line, `${key}-${j}`)}</span>
            </li>
          ))}
        </Tag>
      );
    }

    return (
      <p key={key} data-devlog-block="paragraph" className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
        {renderInline(block.lines.join("\n"), key)}
      </p>
    );
  });
}
