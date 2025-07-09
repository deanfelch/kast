function makeEditableTitle({ 
  containerSelector, 
  titleSelector, 
  buttonSelector, 
  saveUrlFn, 
  idAttribute = "data-id" 
}) {
  document.querySelectorAll(containerSelector).forEach(wrapper => {
    const btn = wrapper.querySelector(buttonSelector);
    if (!btn) return;

    btn.addEventListener("click", () => {
      const titleEl = wrapper.querySelector(titleSelector);
      const id = titleEl.getAttribute(idAttribute);

      if (titleEl.tagName === "SPAN") {
        const newTitle = titleEl.textContent.trim();
        fetch(saveUrlFn(id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle })
        })
        .then(res => res.ok && res.json())
        .then(() => {
          const newEl = document.createElement("span");
          newEl.className = titleEl.className.replace("editing", "");
          newEl.textContent = newTitle || "Untitled";
          newEl.setAttribute(idAttribute, id);
          newEl.setAttribute("title", "Click pencil to edit title");
          newEl.contentEditable = false;
          wrapper.replaceChild(newEl, titleEl);

          btn.textContent = "✏️";
          const check = wrapper.querySelector(".save-confirmation");
          if (check) {
            check.classList.add("show");
            setTimeout(() => check.classList.remove("show"), 1500);
          }
        })
        .catch(err => console.error("Error saving title:", err));
      } else {
        const newEl = document.createElement("span");
        newEl.className = titleEl.className + " editing";
        newEl.textContent = titleEl.textContent;
        newEl.setAttribute(idAttribute, id);
        newEl.contentEditable = true;
        wrapper.replaceChild(newEl, titleEl);
        newEl.focus();
        btn.textContent = "💾";
      }
    });

    wrapper.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches(titleSelector)) {
        e.preventDefault();
        e.target.blur();
      }
    });

    wrapper.addEventListener("blur", e => {
      if (e.target.matches(titleSelector) && e.target.tagName === "SPAN") {
        btn.click();
      }
    }, true);
  });
}
