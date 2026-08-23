/* ==========================================================================
   WINGO EATS — script.js
   Shared UI chrome used on every page: mobile nav toggle, on-scroll reveal
   for static sections, and header shadow on scroll.
   Live data fetching/rendering (restaurants, menus, search) lives in app.js.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        navLinks.style.display = 'flex';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '64px';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.background = '#FFFFFF';
        navLinks.style.flexDirection = 'column';
        navLinks.style.padding = '18px 24px';
        navLinks.style.gap = '16px';
        navLinks.style.borderBottom = '1px solid #E9E4D8';
        navLinks.style.boxShadow = '0 12px 24px rgba(17,17,17,0.08)';
      } else {
        navLinks.style.display = '';
      }
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navLinks.style.display = '';
      });
    });
  }

  /* ---------- Scroll reveal (for any static section using .reveal without .in) ---------- */
  var revealEls = document.querySelectorAll('.reveal:not(.in)');
  if ('IntersectionObserver' in window && revealEls.length) {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Header shadow on scroll ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.style.boxShadow = window.scrollY > 8 ? '0 4px 16px rgba(17,17,17,0.07)' : 'none';
    });
  }

  /* ---------- Custom logo (optional) ----------
     If /assets/logo.png exists, it replaces the "W" mark everywhere on the
     page automatically. If it doesn't exist yet, the default "W" mark stays
     — nothing breaks. To set your logo: upload a file to /assets/logo.png
     in your GitHub repo. No other changes needed. */
  applyCustomLogo();
  applyHeroImage();
});

function applyHeroImage() {
  var el = document.querySelector('.hero-ticket .ph');
  if (!el) return; // only present on the homepage hero
  var probe = new Image();
  probe.onload = function () {
    el.style.backgroundImage = 'url(/assets/hero-food.jpg)';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  };
  probe.src = '/assets/hero-food.jpg';
}

function applyCustomLogo() {
  var marks = document.querySelectorAll('.brand-mark');
  if (!marks.length) return;
  var probe = new Image();
  probe.onload = function () {
    marks.forEach(function (el) {
      el.innerHTML = '<img src="/assets/logo.png" alt="Wingo Eats logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
    });
  };
  probe.src = '/assets/logo.png';
}
