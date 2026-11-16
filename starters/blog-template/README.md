# Blog Template

A plain HTML and CSS blog you can reuse for clients. No frameworks and no build step. Open `index.html` in a browser, or upload the folder to any static host.

## Files

```
Blog_Template/
  index.html        Home page: featured post, all posts, newsletter
  about.html        About the author, contact form
  404.html          Page not found
  posts/            One HTML file per post
  css/style.css     All styles. Brand settings are at the top.
  js/main.js        Phone menu and topic filter buttons
  images/           Photos
```

## Rebrand it for a client

1. Open `css/style.css` and change the variables in `:root` at the top: brand colors, fonts, corner radius and page width. The dark mode colors are just below.
2. Replace the site name `Build Notes` (the `brand` link in the header, the footer, and every `<title>`). Use Find and Replace across the folder.
3. Replace `Jane Doe`, `images/Jane_Doe.jpg` and the bio with the client's details.
4. Change the footer text and the topic names (`Builds`, `Guides`, `Reviews`, `How To`).

## Add a new post

1. Copy any file in `posts/` and rename it, for example `posts/my-new-post.html`. Use lowercase words with dashes.
2. In the new file, change the `<title>`, the description `<meta>` tags, the heading, the date, the read time, the photo and the text inside `<div class="prose">`.
3. In `index.html`, copy one `<li data-category="...">` card, paste it at the top of the list, and update its link, photo, title, summary and date. Set `data-category` to one of the topic names, so the filter buttons find it.
4. Update the Older post and Newer post links at the bottom of the posts next to it.

## Connect the forms

The newsletter and contact forms point to `https://formspree.io/f/YOUR_FORM_ID`. Make a free form at a service such as Formspree, then paste its address into `action` on both forms. They do not send anything until you do.

## Built in

- Works on phones, tablets and computers.
- Follows the device's light or dark mode.
- Skip link, real labels, visible keyboard focus and alt text on every photo.
- Animations turn off for people who ask their device for less motion.
- Each post is a real HTML file, so search engines and link previews can read it.
