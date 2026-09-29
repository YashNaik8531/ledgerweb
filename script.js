const ALLOWED_SPECIALS = "!@#$%^&*";

const authScreen = document.getElementById("authScreen");
const dashboardScreen = document.getElementById("dashboardScreen");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const showLoginBtn = document.getElementById("showLoginBtn");
const showSignupBtn = document.getElementById("showSignupBtn");

const recordView = document.getElementById("recordView");
const recordsView = document.getElementById("recordsView");

const toast = document.getElementById("toast");

let mediaRecorder = null;
let audioChunks = [];
let recordingStartedAt = null;
let timerInterval = null;


/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "normal") {

    toast.textContent = message;

    toast.className =
        `toast show ${type === "normal" ? "" : type}`;

    window.clearTimeout(showToast.timeoutId);

    showToast.timeoutId = window.setTimeout(() => {

        toast.className = "toast";

    }, 3500);
}


/* =========================================================
   VALIDATION
========================================================= */

function isValidEmail(email) {

    const value =
        String(email || "")
            .trim()
            .toLowerCase();

    return (
        value.includes("@") &&
        value.endsWith(".com")
    );
}


function isValidPassword(password) {

    const value =
        String(password || "");

    if (value.length < 8) {
        return false;
    }

    const hasDigit =
        /\d/.test(value);

    const escapedSpecials =
        ALLOWED_SPECIALS.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    const hasSpecial =
        new RegExp(
            `[${escapedSpecials}]`
        ).test(value);

    return (
        hasDigit &&
        hasSpecial
    );
}


/* =========================================================
   AUTH MODE
========================================================= */

function setAuthMode(mode) {

    const loginMode =
        mode === "login";

    loginForm.classList.toggle(
        "hidden",
        !loginMode
    );

    signupForm.classList.toggle(
        "hidden",
        loginMode
    );

    showLoginBtn.classList.toggle(
        "active",
        loginMode
    );

    showSignupBtn.classList.toggle(
        "active",
        !loginMode
    );
}


/* =========================================================
   SHOW DASHBOARD
========================================================= */

function showDashboard(user) {

    authScreen.classList.add("hidden");

    dashboardScreen.classList.remove("hidden");

    document.getElementById(
        "ownerNameDisplay"
    ).textContent =
        user.full_name || "";

    document.getElementById(
        "shopNameDisplay"
    ).textContent =
        user.shop_name || "Shop";

    document.getElementById(
        "welcomeTitle"
    ).textContent =
        `Welcome, ${user.full_name || "Shopkeeper"}`;

    closeDashboardPanels();
}


/* =========================================================
   SHOW LOGIN
========================================================= */

function showAuth() {

    dashboardScreen.classList.add("hidden");

    authScreen.classList.remove("hidden");

    setAuthMode("login");
}


/* =========================================================
   CLOSE DASHBOARD PANELS
========================================================= */

function closeDashboardPanels() {

    recordView.classList.add("hidden");

    recordsView.classList.add("hidden");
}


/* =========================================================
   API HELPER
========================================================= */

async function apiRequest(url, options = {}) {

    const response =
        await fetch(url, {

            headers: {
                "Content-Type": "application/json",

                ...(options.headers || {})
            },

            ...options

        });

    let data;

    try {

        data = await response.json();

    } catch {

        data = {
            success: false,
            message:
                "The server returned an invalid response."
        };

    }

    if (!response.ok) {

        throw new Error(
            data.message ||
            "Something went wrong."
        );

    }

    return data;
}


/* =========================================================
   AUTH TAB BUTTONS
========================================================= */

showLoginBtn.addEventListener(
    "click",
    () => setAuthMode("login")
);

showSignupBtn.addEventListener(
    "click",
    () => setAuthMode("signup")
);


/* =========================================================
   SIGN UP
========================================================= */

signupForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const fullName =
            document.getElementById(
                "fullName"
            ).value.trim();

        const shopName =
            document.getElementById(
                "shopName"
            ).value.trim();

        const personalEmail =
            document.getElementById(
                "personalEmail"
            ).value.trim();

        const shopEmail =
            document.getElementById(
                "shopEmail"
            ).value.trim();

        const password =
            document.getElementById(
                "signupPassword"
            ).value;


        if (
            !fullName ||
            !shopName ||
            !personalEmail ||
            !password
        ) {

            showToast(
                "Please fill all compulsory fields.",
                "error"
            );

            return;
        }


        if (!isValidEmail(personalEmail)) {

            showToast(
                "Personal email must contain @ and end with .com.",
                "error"
            );

            return;
        }


        if (
            shopEmail &&
            !isValidEmail(shopEmail)
        ) {

            showToast(
                "Shop email must contain @ and end with .com.",
                "error"
            );

            return;
        }


        if (!isValidPassword(password)) {

            showToast(
                "Password needs 8+ characters, 1 digit and 1 special symbol from !,@,#,$,%,^,&,*.",
                "error"
            );

            return;
        }


        const submitButton =
            signupForm.querySelector(
                "button[type='submit']"
            );

        submitButton.disabled = true;

        submitButton.textContent =
            "Creating account...";


        try {

            const data =
                await apiRequest(
                    "/api/signup",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            full_name:
                                fullName,

                            shop_name:
                                shopName,

                            personal_email:
                                personalEmail,

                            shop_email:
                                shopEmail,

                            password:
                                password
                        })
                    }
                );


            showToast(
                data.message,
                "success"
            );

            signupForm.reset();

            showDashboard(
                data.user
            );

        } catch (error) {

            showToast(
                error.message,
                "error"
            );

        } finally {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Create Account";
        }

    }
);


/* =========================================================
   LOGIN
========================================================= */

loginForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const personalEmail =
            document.getElementById(
                "loginEmail"
            ).value.trim();

        const password =
            document.getElementById(
                "loginPassword"
            ).value;


        if (!isValidEmail(personalEmail)) {

            showToast(
                "Email must contain @ and end with .com.",
                "error"
            );

            return;
        }


        if (!isValidPassword(password)) {

            showToast(
                "Password needs 8+ characters, 1 digit and 1 special symbol from !,@,#,$,%,^,&,*.",
                "error"
            );

            return;
        }


        const submitButton =
            loginForm.querySelector(
                "button[type='submit']"
            );

        submitButton.disabled = true;

        submitButton.textContent =
            "Signing in...";


        try {

            const data =
                await apiRequest(
                    "/api/login",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            personal_email:
                                personalEmail,

                            password:
                                password
                        })
                    }
                );


            showToast(
                data.message,
                "success"
            );

            loginForm.reset();

            showDashboard(
                data.user
            );

        } catch (error) {

            showToast(
                error.message,
                "error"
            );

        } finally {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Sign In";
        }

    }
);


/* =========================================================
   LOGOUT
========================================================= */

document.getElementById(
    "logoutBtn"
).addEventListener(
    "click",
    async () => {

        try {

            await apiRequest(
                "/api/logout",
                {
                    method: "POST"
                }
            );

            stopRecordingIfNeeded();

            resetGeminiResult();

            showAuth();

            showToast(
                "Signed out successfully.",
                "success"
            );

        } catch (error) {

            showToast(
                error.message,
                "error"
            );

        }

    }
);


/* =========================================================
   DASHBOARD NAVIGATION
========================================================= */

document.getElementById(
    "recordOptionBtn"
).addEventListener(
    "click",
    () => {

        closeDashboardPanels();

        recordView.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "recordsOptionBtn"
).addEventListener(
    "click",
    async () => {

        closeDashboardPanels();

        recordsView.classList.remove(
            "hidden"
        );

        await loadLedger();

    }
);


document.getElementById(
    "backFromRecordBtn"
).addEventListener(
    "click",
    closeDashboardPanels
);


document.getElementById(
    "backFromRecordsBtn"
).addEventListener(
    "click",
    closeDashboardPanels
);


document.getElementById(
    "refreshRecordsBtn"
).addEventListener(
    "click",
    loadLedger
);


/* =========================================================
   VOICE RECORDER
========================================================= */

function updateTimer() {

    if (!recordingStartedAt) {
        return;
    }

    const elapsedSeconds =
        Math.floor(
            (Date.now() - recordingStartedAt) /
            1000
        );

    const minutes =
        String(
            Math.floor(
                elapsedSeconds / 60
            )
        ).padStart(2, "0");

    const seconds =
        String(
            elapsedSeconds % 60
        ).padStart(2, "0");

    document.getElementById(
        "recordTimer"
    ).textContent =
        `${minutes}:${seconds}`;
}


function resetTimer() {

    window.clearInterval(
        timerInterval
    );

    timerInterval = null;

    recordingStartedAt = null;

    document.getElementById(
        "recordTimer"
    ).textContent =
        "00:00";
}


/* =========================================================
   GEMINI STATE
========================================================= */

let latestAudioBlob = null;
let latestAudioUrl = null;
let geminiAnalysisInProgress = false;


/* =========================================================
   GEMINI STATUS
========================================================= */

function setGeminiAnalysisStatus(
    message,
    type = "normal"
) {

    const status =
        document.getElementById(
            "aiAnalysisStatus"
        );

    if (!status) {
        return;
    }

    status.textContent =
        message;

    status.className =
        `ai-analysis-status ${type}`;
}


/* =========================================================
   RESET GEMINI RESULT
========================================================= */

function resetGeminiResult() {

    const resultBox =
        document.getElementById(
            "aiResultBox"
        );

    if (resultBox) {
        resultBox.classList.add("hidden");
    }


    const clarification =
        document.getElementById(
            "aiClarification"
        );

    if (clarification) {

        clarification.textContent =
            "";

        clarification.classList.add(
            "hidden"
        );
    }


    const transcript =
        document.getElementById(
            "aiTranscript"
        );

    if (transcript) {
        transcript.textContent = "";
    }


    const customer =
        document.getElementById(
            "aiCustomerName"
        );

    if (customer) {
        customer.value = "";
    }


    const amount =
        document.getElementById(
            "aiAmount"
        );

    if (amount) {
        amount.value = "";
    }


    const type =
        document.getElementById(
            "aiTransactionType"
        );

    if (type) {
        type.value = "debt";
    }


    setGeminiAnalysisStatus("");
}


/* =========================================================
   DISPLAY GEMINI RESULT
========================================================= */

function showGeminiResult(result) {

    const resultBox =
        document.getElementById(
            "aiResultBox"
        );

    if (!resultBox) {
        return;
    }


    const customer =
        document.getElementById(
            "aiCustomerName"
        );

    const amount =
        document.getElementById(
            "aiAmount"
        );

    const type =
        document.getElementById(
            "aiTransactionType"
        );

    const transcript =
        document.getElementById(
            "aiTranscript"
        );

    const clarification =
        document.getElementById(
            "aiClarification"
        );


    if (customer) {

        customer.value =
            result.customer_name || "";
    }


    if (amount) {

        amount.value =
            result.amount ?? "";
    }


    if (type) {

        type.value =
            result.mode === "credit"
                ? "credit"
                : "debt";
    }


    if (transcript) {

        transcript.textContent =
            result.transcript ||
            "Transcript not available.";
    }


    if (clarification) {

        if (result.needs_clarification) {

            clarification.textContent =
                result.clarification_message ||
                "Please check the extracted information before saving.";

            clarification.classList.remove(
                "hidden"
            );

        } else {

            clarification.textContent =
                "";

            clarification.classList.add(
                "hidden"
            );
        }
    }


    resultBox.classList.remove(
        "hidden"
    );
}


/* =========================================================
   ANALYZE AUDIO WITH GEMINI
========================================================= */

async function analyzeRecordedAudio(
    audioBlob
) {

    if (
        !audioBlob ||
        audioBlob.size === 0
    ) {

        showToast(
            "No audio was captured. Please record again.",
            "error"
        );

        return;
    }


    if (geminiAnalysisInProgress) {
        return;
    }


    geminiAnalysisInProgress = true;

    latestAudioBlob =
        audioBlob;


    const recordButton =
        document.getElementById(
            "recordBtn"
        );

    const recordButtonText =
        document.getElementById(
            "recordBtnText"
        );

    const saveButton =
        document.getElementById(
            "saveAiTransactionBtn"
        );

    const recordAgainButton =
        document.getElementById(
            "recordAgainBtn"
        );


    if (recordButton) {
        recordButton.disabled = true;
    }


    if (recordButtonText) {

        recordButtonText.textContent =
            "Analyzing...";
    }


    if (saveButton) {
        saveButton.disabled = true;
    }


    if (recordAgainButton) {
        recordAgainButton.disabled = true;
    }


    setGeminiAnalysisStatus(
        "Gemini 3.8 Flash is analyzing your recording...",
        "loading"
    );


    try {

        const formData =
            new FormData();


        /*
         * IMPORTANT:
         *
         * The Gemini API key is NOT used here.
         *
         * Browser
         *    ↓
         * Flask
         *    ↓
         * Gemini
         *
         * This keeps the Gemini API key on the server.
         */

        const mimeType =
            audioBlob.type ||
            "audio/webm";


        let extension =
            "webm";


        if (mimeType.includes("mp4")) {

            extension =
                "mp4";

        } else if (
            mimeType.includes("mpeg")
        ) {

            extension =
                "mp3";

        } else if (
            mimeType.includes("wav")
        ) {

            extension =
                "wav";

        } else if (
            mimeType.includes("ogg")
        ) {

            extension =
                "ogg";
        }


        formData.append(
            "audio",
            audioBlob,
            `transaction.${extension}`
        );


        const response =
            await fetch(
                "/api/analyze-transaction",
                {
                    method: "POST",
                    body: formData
                }
            );


        let data;


        try {

            data =
                await response.json();

        } catch {

            data = {
                success: false,
                message:
                    "The server returned an invalid response."
            };
        }


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Gemini could not analyze the recording."
            );
        }


        if (
            !data.success ||
            !data.result
        ) {

            throw new Error(
                data.message ||
                "Gemini did not return a valid transaction."
            );
        }


        showGeminiResult(
            data.result
        );


        if (
            data.result.needs_clarification
        ) {

            setGeminiAnalysisStatus(
                "Please check the extracted information before saving.",
                "warning"
            );

        } else {

            setGeminiAnalysisStatus(
                "Analysis complete. Check the details and confirm before saving.",
                "success"
            );
        }


        const saveButtonAfterAnalysis =
            document.getElementById(
                "saveAiTransactionBtn"
            );


        if (saveButtonAfterAnalysis) {

            saveButtonAfterAnalysis.disabled =
                false;
        }


        document.getElementById(
            "recordStatus"
        ).textContent =
            "Analysis complete.";


        document.getElementById(
            "microphoneMessage"
        ).textContent =
            "Check the extracted customer, amount and transaction type before saving.";


    } catch (error) {

        console.error(
            "Gemini transaction analysis error:",
            error
        );


        setGeminiAnalysisStatus(
            error.message ||
            "Gemini analysis failed. Please record again.",
            "error"
        );


        document.getElementById(
            "recordStatus"
        ).textContent =
            "Gemini analysis failed.";


        document.getElementById(
            "microphoneMessage"
        ).textContent =
            "Please record the transaction again.";


        showToast(
            error.message ||
            "Could not analyze the recording.",
            "error"
        );


    } finally {

        geminiAnalysisInProgress =
            false;


        if (recordButton) {
            recordButton.disabled = false;
        }


        if (recordButtonText) {

            recordButtonText.textContent =
                "Start Recording";
        }


        if (recordAgainButton) {
            recordAgainButton.disabled = false;
        }
    }
}


/* =========================================================
   START RECORDING
========================================================= */

async function startRecording() {

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        showToast(
            "This browser does not support microphone recording.",
            "error"
        );

        return;
    }


    if (geminiAnalysisInProgress) {

        showToast(
            "Gemini is still analyzing the previous recording.",
            "normal"
        );

        return;
    }


    try {

        resetGeminiResult();


        const stream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true
                });


        audioChunks = [];


        /*
         * Prefer WebM/Opus where supported.
         * This is commonly supported by Chrome.
         */

        let recorderOptions = {};


        if (
            MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus"
            )
        ) {

            recorderOptions.mimeType =
                "audio/webm;codecs=opus";

        } else if (
            MediaRecorder.isTypeSupported(
                "audio/webm"
            )
        ) {

            recorderOptions.mimeType =
                "audio/webm";
        }


        mediaRecorder =
            Object.keys(recorderOptions).length
                ? new MediaRecorder(
                    stream,
                    recorderOptions
                )
                : new MediaRecorder(
                    stream
                );


        mediaRecorder.addEventListener(
            "dataavailable",
            (event) => {

                if (
                    event.data &&
                    event.data.size > 0
                ) {

                    audioChunks.push(
                        event.data
                    );
                }

            }
        );


        mediaRecorder.addEventListener(
            "stop",
            async () => {

                stream
                    .getTracks()
                    .forEach(
                        (track) =>
                            track.stop()
                    );


                const audioBlob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                                mediaRecorder.mimeType ||
                                "audio/webm"
                        }
                    );


                if (latestAudioUrl) {

                    URL.revokeObjectURL(
                        latestAudioUrl
                    );
                }


                latestAudioUrl =
                    URL.createObjectURL(
                        audioBlob
                    );


                const audioPreview =
                    document.getElementById(
                        "audioPreview"
                    );


                if (audioPreview) {

                    audioPreview.src =
                        latestAudioUrl;

                    audioPreview.classList.remove(
                        "hidden"
                    );
                }


                document.getElementById(
                    "recordStatus"
                ).textContent =
                    "Recording captured. Sending audio to Gemini...";


                document.getElementById(
                    "microphoneMessage"
                ).textContent =
                    "Gemini is analyzing the recording. Please wait.";


                await analyzeRecordedAudio(
                    audioBlob
                );

            }
        );


        mediaRecorder.start();


        recordingStartedAt =
            Date.now();


        timerInterval =
            window.setInterval(
                updateTimer,
                250
            );


        const button =
            document.getElementById(
                "recordBtn"
            );


        button.classList.add(
            "recording"
        );


        document.getElementById(
            "recordBtnText"
        ).textContent =
            "Stop Recording";


        document.getElementById(
            "recordStatus"
        ).textContent =
            "Recording...";


        document.getElementById(
            "recordStatus"
        ).classList.add(
            "recording"
        );


        document.getElementById(
            "microphoneMessage"
        ).textContent =
            "Speak naturally in Hindi, English or Hinglish.";

    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );


        showToast(
            "Microphone permission was denied or the microphone is unavailable.",
            "error"
        );
    }
}


/* =========================================================
   STOP RECORDING
========================================================= */

function stopRecording() {

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        mediaRecorder.stop();
    }


    const button =
        document.getElementById(
            "recordBtn"
        );


    button.classList.remove(
        "recording"
    );


    document.getElementById(
        "recordBtnText"
    ).textContent =
        "Start Recording";


    document.getElementById(
        "recordStatus"
    ).classList.remove(
        "recording"
    );


    resetTimer();
}


/* =========================================================
   STOP RECORDING IF NEEDED
========================================================= */

function stopRecordingIfNeeded() {

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        stopRecording();
    }
}


/* =========================================================
   RECORD BUTTON
========================================================= */

document.getElementById(
    "recordBtn"
).addEventListener(
    "click",
    () => {

        if (
            mediaRecorder &&
            mediaRecorder.state === "recording"
        ) {

            stopRecording();

        } else {

            startRecording();
        }
    }
);


/* =========================================================
   SAVE GEMINI TRANSACTION
========================================================= */

async function saveGeminiTransaction() {

    const customerName =
        document.getElementById(
            "aiCustomerName"
        ).value.trim();


    const amount =
        Number(
            document.getElementById(
                "aiAmount"
            ).value
        );


    const transactionType =
        document.getElementById(
            "aiTransactionType"
        ).value;


    if (!customerName) {

        showToast(
            "Please enter the customer name.",
            "error"
        );

        return;
    }


    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {

        showToast(
            "Please enter a valid amount.",
            "error"
        );

        return;
    }


    if (
        transactionType !== "debt" &&
        transactionType !== "credit"
    ) {

        showToast(
            "Please select debt or credit.",
            "error"
        );

        return;
    }


    const saveButton =
        document.getElementById(
            "saveAiTransactionBtn"
        );


    saveButton.disabled =
        true;

    saveButton.textContent =
        "Saving...";


    try {

        const data =
            await apiRequest(
                "/api/transactions",
                {
                    method: "POST",

                    body: JSON.stringify({

                        customer_name:
                            customerName,

                        amount:
                            amount,

                        transaction_type:
                            transactionType,

                        description:
                            "Recorded and analyzed by Gemini 3.8 Flash"
                    })
                }
            );


        showToast(
            data.message ||
            "Transaction saved successfully.",
            "success"
        );


        resetGeminiResult();


        if (latestAudioUrl) {

            URL.revokeObjectURL(
                latestAudioUrl
            );

            latestAudioUrl =
                null;
        }


        latestAudioBlob =
            null;


        const audioPreview =
            document.getElementById(
                "audioPreview"
            );


        if (audioPreview) {

            audioPreview.pause();

            audioPreview.removeAttribute(
                "src"
            );

            audioPreview.load();

            audioPreview.classList.add(
                "hidden"
            );
        }


        document.getElementById(
            "recordStatus"
        ).textContent =
            "Transaction saved successfully.";


        document.getElementById(
            "microphoneMessage"
        ).textContent =
            "You can record the next transaction.";


        if (
            !recordsView.classList.contains(
                "hidden"
            )
        ) {

            await loadLedger();
        }


    } catch (error) {

        showToast(
            error.message ||
            "Could not save the transaction.",
            "error"
        );


    } finally {

        saveButton.disabled =
            false;

        saveButton.textContent =
            "Confirm & Save";
    }
}


/* =========================================================
   RECORD AGAIN
========================================================= */

function prepareRecordAgain() {

    resetGeminiResult();


    latestAudioBlob =
        null;


    if (latestAudioUrl) {

        URL.revokeObjectURL(
            latestAudioUrl
        );

        latestAudioUrl =
            null;
    }


    const audioPreview =
        document.getElementById(
            "audioPreview"
        );


    if (audioPreview) {

        audioPreview.pause();

        audioPreview.removeAttribute(
            "src"
        );

        audioPreview.load();

        audioPreview.classList.add(
            "hidden"
        );
    }


    document.getElementById(
        "recordStatus"
    ).textContent =
        "Ready to record.";


    document.getElementById(
        "microphoneMessage"
    ).textContent =
        "Speak naturally in Hindi, English or Hinglish.";
}


/* =========================================================
   GEMINI RESULT BUTTONS
========================================================= */

const saveAiTransactionButton =
    document.getElementById(
        "saveAiTransactionBtn"
    );


if (saveAiTransactionButton) {

    saveAiTransactionButton.addEventListener(
        "click",
        saveGeminiTransaction
    );
}


const recordAgainButton =
    document.getElementById(
        "recordAgainBtn"
    );


if (recordAgainButton) {

    recordAgainButton.addEventListener(
        "click",
        () => {

            if (
                mediaRecorder &&
                mediaRecorder.state !== "inactive"
            ) {

                stopRecordingIfNeeded();
            }


            prepareRecordAgain();
        }
    );
}


/* =========================================================
   TEMPORARY MANUAL DATABASE TEST
========================================================= */

document.getElementById(
    "manualTransactionForm"
).addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const customerName =
            document.getElementById(
                "testCustomer"
            ).value.trim();


        const amount =
            Number(
                document.getElementById(
                    "testAmount"
                ).value
            );


        const transactionType =
            document.getElementById(
                "testType"
            ).value;


        if (
            !customerName ||
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            showToast(
                "Enter a valid customer name and amount.",
                "error"
            );

            return;
        }


        const submitButton =
            event.target.querySelector(
                "button[type='submit']"
            );


        submitButton.disabled =
            true;


        submitButton.textContent =
            "Saving...";


        try {

            const data =
                await apiRequest(
                    "/api/transactions",
                    {
                        method: "POST",

                        body: JSON.stringify({

                            customer_name:
                                customerName,

                            amount:
                                amount,

                            transaction_type:
                                transactionType,

                            description:
                                "Temporary manual database test"
                        })
                    }
                );


            showToast(
                data.message,
                "success"
            );


            event.target.reset();


        } catch (error) {

            showToast(
                error.message,
                "error"
            );


        } finally {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Save Test Transaction";
        }

    }
);


/* =========================================================
   CURRENCY
========================================================= */

function formatCurrency(value) {

    return new Intl.NumberFormat(
        "en-IN",
        {
            style: "currency",
            currency: "INR",

            minimumFractionDigits: 2
        }
    ).format(
        Number(value) || 0
    );
}


/* =========================================================
   RENDER LEDGER
========================================================= */

function renderLedgerList(
    elementId,
    rows,
    type
) {

    const container =
        document.getElementById(
            elementId
        );


    container.innerHTML =
        "";


    if (!rows.length) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "ledger-row";


        empty.textContent =
            type === "debt"
                ? "No debt records yet."
                : "No credit records yet.";


        container.appendChild(
            empty
        );


        return;
    }


    rows.forEach((row) => {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "ledger-row";


        const customerBlock =
            document.createElement(
                "div"
            );


        const customer =
            document.createElement(
                "span"
            );


        customer.className =
            "ledger-customer";


        customer.textContent =
            row.customer_name;


        const date =
            document.createElement(
                "span"
            );


        date.className =
            "ledger-date";


        date.textContent =
            row.transaction_date || "";


        customerBlock.appendChild(
            customer
        );


        customerBlock.appendChild(
            date
        );


        const amount =
            document.createElement(
                "span"
            );


        amount.className =
            "ledger-amount";


        amount.textContent =
            formatCurrency(
                row.amount
            );


        item.appendChild(
            customerBlock
        );


        item.appendChild(
            amount
        );


        container.appendChild(
            item
        );

    });
}


/* =========================================================
   LOAD LEDGER FROM MYSQL
========================================================= */

async function loadLedger() {

    const message =
        document.getElementById(
            "ledgerMessage"
        );


    message.classList.add(
        "hidden"
    );


    try {

        const data =
            await apiRequest(
                "/api/ledger"
            );


        renderLedgerList(
            "debtList",
            data.debt,
            "debt"
        );


        renderLedgerList(
            "creditList",
            data.credit,
            "credit"
        );


        document.getElementById(
            "debtCount"
        ).textContent =
            data.debt.length;


        document.getElementById(
            "creditCount"
        ).textContent =
            data.credit.length;


        const totalDebt =
            data.debt.reduce(
                (sum, row) =>
                    sum + Number(row.amount),
                0
            );


        const totalCredit =
            data.credit.reduce(
                (sum, row) =>
                    sum + Number(row.amount),
                0
            );


        document.getElementById(
            "totalDebt"
        ).textContent =
            formatCurrency(
                totalDebt
            );


        document.getElementById(
            "totalCredit"
        ).textContent =
            formatCurrency(
                totalCredit
            );


        document.getElementById(
            "outstandingAmount"
        ).textContent =
            formatCurrency(
                Math.max(
                    totalDebt -
                    totalCredit,
                    0
                )
            );


    } catch (error) {

        message.textContent =
            error.message;


        message.classList.remove(
            "hidden"
        );
    }
}


/* =========================================================
   CHECK EXISTING LOGIN SESSION
========================================================= */

async function checkExistingSession() {

    try {

        const data =
            await apiRequest(
                "/api/me"
            );


        if (data.authenticated) {

            showDashboard(
                data.user
            );

        } else {

            showAuth();
        }


    } catch {

        showAuth();
    }
}


checkExistingSession();