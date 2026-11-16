// Rebuilds the post list on the home page from the files in posts/.
// Run it after you add, edit or delete a post:   node scripts/list-posts.mjs
//
// Every post file in posts/ gets a card, newest first, so an old post can
// never be lost from the home page. The featured post at the top of
// index.html is left out of the list, because it is already shown there.
// Needs Node 18 or newer. No packages to install.

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const indexFile = path.join(root, "index.html");
const postsFolder = path.join(root, "posts");

// Pull one value out of a post file, or stop with a clear message.
function find(html, pattern, what, file) {
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`${file} is missing ${what}.`);
  }
  return match[1].trim();
}

function readPost(file) {
  const html = fs.readFileSync(path.join(postsFolder, file), "utf8");
  const header = find(html, /<header class="article-header">([\s\S]*?)<\/header>/, "the article header", file);
  const hero = find(html, /<figure class="article-hero">([\s\S]*?)<\/figure>/, "the article photo", file);
  const image = find(hero, /(<img [^>]*>)/, "an <img> in the article photo", file);

  return {
    slug: file.replace(/\.html$/, ""),
    title: find(header, /<h1>([\s\S]*?)<\/h1>/, "an <h1>", file),
    category: find(header, /<span class="tag">([\s\S]*?)<\/span>/, "a tag", file),
    date: find(header, /<time datetime="([^"]+)"/, "a date", file),
    readTime: find(header, /<span>(\d+) min read<\/span>/, "a read time", file),
    excerpt: find(html, /<meta name="description" content="([^"]*)"/, "a description", file),
    src: find(image, /src="\.\.\/([^"]+)"/, "a photo src", file),
    alt: find(image, /alt="([^"]*)"/, "photo alt text", file),
    width: find(image, /width="(\d+)"/, "a photo width", file),
    height: find(image, /height="(\d+)"/, "a photo height", file),
  };
}

function niceDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function card(post) {
  return `        <li data-category="${post.category}">
          <article class="post-card">
            <img class="post-card__image" src="${post.src}" alt="${post.alt}" width="${post.width}" height="${post.height}" loading="lazy">
            <div class="post-card__body">
              <span class="tag">${post.category}</span>
              <h3 class="post-card__title"><a href="posts/${post.slug}.html">${post.title}</a></h3>
              <p class="post-card__excerpt">${post.excerpt}</p>
              <p class="meta"><time datetime="${post.date}">${niceDate(post.date)}</time><span aria-hidden="true">&middot;</span><span>${post.readTime} min read</span></p>
            </div>
          </article>
        </li>`;
}

const index = fs.readFileSync(indexFile, "utf8");
const start = index.indexOf("<!-- POSTS START");
const end = index.indexOf("<!-- POSTS END -->");
if (start === -1 || end === -1) {
  throw new Error("index.html needs the POSTS START and POSTS END comments around the post list.");
}

const featured = index.match(/class="hero__title"><a href="posts\/([^"]+)\.html"/)?.[1];
const posts = fs
  .readdirSync(postsFolder)
  .filter((file) => file.endsWith(".html"))
  .map(readPost)
  .filter((post) => post.slug !== featured)
  .sort((a, b) => b.date.localeCompare(a.date));

const startLineEnd = index.indexOf("\n", start) + 1;
const updated = index.slice(0, startLineEnd) + posts.map(card).join("\n") + "\n        " + index.slice(end);
fs.writeFileSync(indexFile, updated);

console.log(`Listed ${posts.length} posts on the home page${featured ? `, plus ${featured} as the featured post` : ""}.`);
