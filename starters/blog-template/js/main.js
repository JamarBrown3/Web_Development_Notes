// Small helpers for the blog. The site still works if this file fails to load.

// Phone menu: the button shows and hides the links.
const menuButton = document.querySelector(".menu-button");
const siteNav = document.getElementById("site-nav");

if (menuButton && siteNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
}

// Category buttons on the home page hide the posts that do not match.
const filterButtons = document.querySelectorAll(".filter");
const postCards = document.querySelectorAll("[data-category]");
const resultMessage = document.getElementById("filter-result");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const category = button.dataset.filter;
    let shown = 0;

    filterButtons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));

    postCards.forEach((card) => {
      const matches = category === "all" || card.dataset.category === category;
      card.hidden = !matches;
      if (matches) shown += 1;
    });

    resultMessage.textContent = `Showing ${shown} ${shown === 1 ? "post" : "posts"}.`;
  });
});
