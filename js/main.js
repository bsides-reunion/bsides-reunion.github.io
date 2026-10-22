(() => {
  const header = document.getElementById("site-header");
  const menuButton = document.getElementById("menu-button");
  const mobileMenu = document.getElementById("mobile-menu");
  const alertForm = document.getElementById("alert-form");
  const alertMessage = document.getElementById("alert-message");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Sticky header state */
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile nav */
  const setMenuOpen = (open) => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    if (open) {
      mobileMenu.hidden = false;
      mobileMenu.classList.add("is-open");
    } else {
      mobileMenu.classList.remove("is-open");
      mobileMenu.hidden = true;
    }
  };

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    setMenuOpen(open);
  });

  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  /* Schedule tabs */
  const tabs = document.querySelectorAll("[data-tab]");
  const panels = {
    salle1: document.getElementById("panel-salle1"),
    salle2: document.getElementById("panel-salle2"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.getAttribute("data-tab");
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      Object.entries(panels).forEach(([id, panel]) => {
        if (!panel) return;
        panel.hidden = id !== key;
      });
    });
  });

  /* Reveal on scroll */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const reveals = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  /* Alert form (front-end only) */
  alertForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("alert-email");
    const email = input?.value?.trim() || "";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!valid) {
      if (alertMessage) {
        alertMessage.textContent = "Indiquez une adresse e-mail valide.";
        alertMessage.style.color = "var(--accent)";
      }
      input?.focus();
      return;
    }

    try {
      const list = JSON.parse(localStorage.getItem("bsides-alerts") || "[]");
      if (!list.includes(email)) list.push(email);
      localStorage.setItem("bsides-alerts", JSON.stringify(list));
    } catch (_) {
      /* ignore storage errors */
    }

    if (alertMessage) {
      alertMessage.textContent = "C’est noté. Vous serez alerté·e dès l’annonce 2027 (stockage local pour cette démo).";
      alertMessage.style.color = "var(--secondary)";
    }
    alertForm.reset();
  });
})();
