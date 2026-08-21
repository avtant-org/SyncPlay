document.addEventListener("DOMContentLoaded", () => {
    const btnCreate = document.getElementById("btn-create");
    const btnJoinMode = document.getElementById("btn-join-mode");
    const btnJoinSubmit = document.getElementById("btn-join-submit");
    const roomInputGroup = document.getElementById("room-input-group");
    const nameInput = document.getElementById("display-name");
    const roomInput = document.getElementById("room-id");

    // Load saved name
    const savedName = localStorage.getItem("syncplay_name");
    if (savedName) {
        nameInput.value = savedName;
    }

    function saveNameAndGet() {
        const name = nameInput.value.trim() || "Anonymous";
        localStorage.setItem("syncplay_name", name);
        return encodeURIComponent(name);
    }

    btnCreate.addEventListener("click", () => {
        const name = saveNameAndGet();
        // Generate a random room ID (e.g. 6 chars uppercase alphanumeric)
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        window.location.href = `/room/${roomId}?name=${name}`;
    });

    btnJoinMode.addEventListener("click", () => {
        btnCreate.classList.add("hidden");
        btnJoinMode.classList.add("hidden");
        roomInputGroup.classList.remove("hidden");
        btnJoinSubmit.classList.remove("hidden");
        roomInput.focus();
    });

    btnJoinSubmit.addEventListener("click", () => {
        const name = saveNameAndGet();
        const roomId = roomInput.value.trim().toUpperCase();
        if (!roomId) {
            alert("Please enter a Room ID");
            return;
        }
        window.location.href = `/room/${roomId}?name=${name}`;
    });

    roomInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            btnJoinSubmit.click();
        }
    });
});
