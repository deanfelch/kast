function makeEditableTitle({ 
  containerSelector, 
  titleSelector, 
  buttonSelector, 
  saveUrlFn, 
  idAttribute = "data-id" 
}) {
  document.querySelectorAll(containerSelector).forEach(wrapper => {
    const btn = wrapper.querySelector(buttonSelector);
    const titleEl = wrapper.querySelector(titleSelector);
    if (!btn || !titleEl) return;

    btn.addEventListener("click", () => {
      const id = titleEl.getAttribute(idAttribute);

      // Toggle edit mode
      const isEditing = titleEl.isContentEditable;

      if (!isEditing) {
        console.log("🖊 Entering edit mode");
        titleEl.contentEditable = "true";
        titleEl.classList.add("editing");
        titleEl.focus();
        btn.textContent = "💾";
      } else {
        console.log("💾 Saving title");
        const newTitle = titleEl.textContent.trim();

        fetch(saveUrlFn(id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle })
        })
        .then(res => res.ok && res.json())
        .then(() => {
          titleEl.contentEditable = "false";
          titleEl.classList.remove("editing");
          titleEl.textContent = newTitle || "Untitled";
          btn.textContent = "✏️";

          const check = wrapper.querySelector(".save-confirmation");
          if (check) {
            check.classList.add("show");
            setTimeout(() => check.classList.remove("show"), 1500);
          }
        })
        .catch(err => console.error("❌ Error saving title:", err));
      }
    });

    wrapper.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches(titleSelector)) {
        e.preventDefault();
        e.target.blur();
      }
    });

    wrapper.addEventListener("blur", e => {
      if (e.target.matches(titleSelector) && e.target.isContentEditable) {
        btn.click();
      }
    }, true);
  });
}
