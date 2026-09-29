import os
import re
import json
from datetime import datetime
from functools import wraps

from dotenv import load_dotenv

from flask import (
    Flask,
    jsonify,
    request,
    send_from_directory,
    session
)

import mysql.connector
from mysql.connector import Error

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from google import genai
from google.genai import types


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()


BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)


# =========================================================
# FLASK
# =========================================================

app = Flask(
    __name__,
    static_folder=None
)


app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "change-this-secret-key"
)


# Session configuration
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


# Maximum HTTP request size
# Gemini inline audio should remain below 20 MB.
app.config["MAX_CONTENT_LENGTH"] = (
    20 * 1024 * 1024
)


# =========================================================
# MYSQL CONFIGURATION
# =========================================================

DB_CONFIG = {
    "host": os.getenv(
        "MYSQL_HOST",
        "localhost"
    ),

    "port": int(
        os.getenv(
            "MYSQL_PORT",
            "3306"
        )
    ),

    "user": os.getenv(
        "MYSQL_USER",
        "root"
    ),

    "password": os.getenv(
        "MYSQL_PASSWORD",
        ""
    ),

    "database": os.getenv(
        "MYSQL_DATABASE",
        "kirana_ledger"
    )
}


# =========================================================
# OPTIONAL MYSQL SSL
# =========================================================

MYSQL_SSL_CA = os.getenv(
    "MYSQL_SSL_CA",
    ""
).strip()


if MYSQL_SSL_CA:

    DB_CONFIG["ssl_ca"] = (
        MYSQL_SSL_CA
    )

    DB_CONFIG["ssl_verify_cert"] = True


# =========================================================
# PASSWORD SPECIAL CHARACTERS
# =========================================================

ALLOWED_SPECIALS = "!@#$%^&*"


# =========================================================
# GEMINI CONFIGURATION
# =========================================================

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    ""
).strip()


GEMINI_MODEL = (
    "gemini-3.8-flash"
)


gemini_client = None


if GEMINI_API_KEY:

    gemini_client = genai.Client(
        api_key=GEMINI_API_KEY
    )


# =========================================================
# GEMINI STRUCTURED OUTPUT SCHEMA
# =========================================================

TRANSACTION_SCHEMA = {

    "type": "object",

    "properties": {

        "customer_name": {

            "type": "string",

            "nullable": True,

            "description":
                "The customer's full name."
        },

        "amount": {

            "type": "number",

            "nullable": True,

            "description":
                "The transaction amount in Indian rupees."
        },

        "mode": {

            "type": "string",

            "nullable": True,

            "enum": [
                "debt",
                "credit"
            ],

            "description":
                "debt means the customer has not paid. "
                "credit means the customer has already paid."
        },

        "transcript": {

            "type": "string",

            "description":
                "The spoken transaction converted into text."
        },

        "language": {

            "type": "string",

            "description":
                "The primary language or combination of languages."
        },

        "needs_clarification": {

            "type": "boolean",

            "description":
                "True when the customer name, amount, "
                "or transaction type cannot be determined confidently."
        },

        "clarification_message": {

            "type": "string",

            "nullable": True,

            "description":
                "Short explanation of missing or unclear information."
        }
    },

    "required": [

        "customer_name",
        "amount",
        "mode",
        "transcript",
        "language",
        "needs_clarification",
        "clarification_message"
    ],

    "additionalProperties": False
}


# =========================================================
# GEMINI TRANSACTION PROMPT
# =========================================================

TRANSACTION_PROMPT = """
You are the transaction extraction system for KiranaLedger,
a transaction-recording application for local shopkeepers.

Listen carefully to the provided audio and extract the
transaction information.

The shopkeeper may speak in:

- English
- Hindi
- Hinglish
- Marathi
- Hindi + English
- Marathi + English
- Other mixed Indian-language speech

You must understand natural spoken language.

Examples:

"Ramesh ne 500 rupaye ka maal liya,
baad mein paise dega."

means:

customer_name = "Ramesh"
amount = 500
mode = "debt"

because the customer has NOT paid.

Another example:

"Suresh ne 300 rupees diye."

means:

customer_name = "Suresh"
amount = 300
mode = "credit"

because the customer has already paid.

IMPORTANT MEANING:

debt:
The customer took products/services but has NOT paid.
The customer will pay later.

credit:
The customer purchased and HAS already paid.

Convert spoken number words into numbers.

Examples:

"five hundred" -> 500
"five hundred rupees" -> 500
"paanch sau" -> 500
"पाँच सौ" -> 500
"do hazaar" -> 2000
"दो हजार" -> 2000

If the customer's name cannot be identified,
set customer_name to null.

If the amount cannot be identified,
set amount to null.

If it is unclear whether the customer has paid,
set mode to null.

If any required information is missing or unclear,
set needs_clarification to true.

If all required information is clear,
set needs_clarification to false.

The transcript should contain the spoken transaction
converted into text as accurately as possible.

Return ONLY the structured JSON matching the provided schema.
"""


# =========================================================
# MYSQL CONNECTION
# =========================================================

def get_db_connection():

    """
    Create a new MySQL connection
    for one request.
    """

    return mysql.connector.connect(
        **DB_CONFIG
    )


# =========================================================
# INITIALIZE DATABASE
# =========================================================

def initialize_database():

    """
    Create the database and required tables
    if they do not already exist.
    """

    server_config = DB_CONFIG.copy()

    server_config.pop(
        "database",
        None
    )

    database_name = DB_CONFIG[
        "database"
    ]

    if not database_name:

        raise RuntimeError(
            "MYSQL_DATABASE is empty in .env"
        )

    # Validate database name before
    # using it inside SQL.

    if not re.fullmatch(
        r"[A-Za-z0-9_]+",
        database_name
    ):

        raise RuntimeError(
            "MYSQL_DATABASE may contain only "
            "letters, numbers and underscores."
        )

    server_connection = None
    server_cursor = None

    try:

        # -------------------------------------------------
        # CONNECT TO MYSQL SERVER
        # WITHOUT SELECTING DATABASE
        # -------------------------------------------------

        server_connection = (
            mysql.connector.connect(
                **server_config
            )
        )

        server_cursor = (
            server_connection.cursor()
        )

        # -------------------------------------------------
        # CREATE DATABASE
        # -------------------------------------------------

        server_cursor.execute(
            f"""
            CREATE DATABASE IF NOT EXISTS
            `{database_name}`
            """
        )

        server_connection.commit()

    finally:

        if server_cursor:

            server_cursor.close()

        if (
            server_connection
            and server_connection.is_connected()
        ):

            server_connection.close()

    # -----------------------------------------------------
    # CONNECT TO THE APPLICATION DATABASE
    # -----------------------------------------------------

    connection = None
    cursor = None

    try:

        connection = (
            get_db_connection()
        )

        cursor = connection.cursor()

        # =================================================
        # USERS TABLE
        # =================================================

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (

                id INT AUTO_INCREMENT PRIMARY KEY,

                full_name VARCHAR(120)
                    NOT NULL,

                shop_name VARCHAR(150)
                    NOT NULL,

                personal_email VARCHAR(255)
                    NOT NULL UNIQUE,

                shop_email VARCHAR(255)
                    NULL,

                password_hash VARCHAR(255)
                    NOT NULL,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # =================================================
        # TRANSACTIONS TABLE
        # =================================================

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (

                id INT AUTO_INCREMENT PRIMARY KEY,

                user_id INT NOT NULL,

                customer_name VARCHAR(150)
                    NOT NULL,

                amount DECIMAL(12, 2)
                    NOT NULL,

                transaction_type
                    ENUM('debt', 'credit')
                    NOT NULL,

                description VARCHAR(500)
                    NULL,

                transaction_date TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                INDEX idx_user_type_amount
                    (user_id, transaction_type, amount)
            )
            """
        )

        connection.commit()

    finally:

        if cursor:

            cursor.close()

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# EMAIL VALIDATION
# =========================================================

def valid_email(email):

    """
    Email must:

    1. contain @
    2. end with .com
    """

    if not isinstance(
        email,
        str
    ):

        return False

    email = (
        email
        .strip()
        .lower()
    )

    return (
        "@" in email
        and email.endswith(".com")
    )


# =========================================================
# PASSWORD VALIDATION
# =========================================================

def valid_password(password):

    """
    Password must have:

    - minimum 8 characters
    - at least one digit
    - at least one special character
      from !,@,#,$,%,^,&,*
    """

    if (
        not isinstance(
            password,
            str
        )
        or len(password) < 8
    ):

        return False

    has_digit = any(
        character.isdigit()
        for character in password
    )

    has_special = any(
        character in ALLOWED_SPECIALS
        for character in password
    )

    return (
        has_digit
        and has_special
    )


# =========================================================
# LOGIN REQUIRED DECORATOR
# =========================================================

def login_required(function):

    @wraps(function)
    def decorated(
        *args,
        **kwargs
    ):

        if "user_id" not in session:

            return jsonify({

                "success": False,

                "message":
                    "Please sign in first."

            }), 401

        return function(
            *args,
            **kwargs
        )

    return decorated


# =========================================================
# FRONTEND ROUTES
# =========================================================

@app.route("/")
def home():

    return send_from_directory(
        BASE_DIR,
        "index.html"
    )


@app.route("/style.css")
def style():

    return send_from_directory(
        BASE_DIR,
        "style.css"
    )


@app.route("/script.js")
def script():

    return send_from_directory(
        BASE_DIR,
        "script.js"
    )


# =========================================================
# SIGN UP
# =========================================================

@app.post("/api/signup")
def signup():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    full_name = str(
        data.get(
            "full_name",
            ""
        )
    ).strip()

    shop_name = str(
        data.get(
            "shop_name",
            ""
        )
    ).strip()

    personal_email = str(
        data.get(
            "personal_email",
            ""
        )
    ).strip().lower()

    shop_email = str(
        data.get(
            "shop_email",
            ""
        )
    ).strip().lower()

    password = data.get(
        "password",
        ""
    )

    # -----------------------------------------------------
    # REQUIRED FIELDS
    # -----------------------------------------------------

    if (
        not full_name
        or not shop_name
        or not personal_email
        or not password
    ):

        return jsonify({

            "success": False,

            "message":
                "Full name, shop name, personal email "
                "and password are required."

        }), 400

    # -----------------------------------------------------
    # PERSONAL EMAIL
    # -----------------------------------------------------

    if not valid_email(
        personal_email
    ):

        return jsonify({

            "success": False,

            "message":
                "Personal email must contain @ "
                "and end with .com."

        }), 400

    # -----------------------------------------------------
    # SHOP EMAIL
    # -----------------------------------------------------

    if (
        shop_email
        and not valid_email(
            shop_email
        )
    ):

        return jsonify({

            "success": False,

            "message":
                "Shop email must contain @ "
                "and end with .com."

        }), 400

    # -----------------------------------------------------
    # PASSWORD
    # -----------------------------------------------------

    if not valid_password(
        password
    ):

        return jsonify({

            "success": False,

            "message":
                "Password must be at least 8 characters "
                "and contain one digit and one special "
                "symbol from !,@,#,$,%,^,&,*."

        }), 400

    connection = None
    cursor = None

    try:

        connection = (
            get_db_connection()
        )

        cursor = connection.cursor()

        # -------------------------------------------------
        # CHECK EXISTING ACCOUNT
        # -------------------------------------------------

        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE personal_email = %s
            """,
            (
                personal_email,
            )
        )

        if cursor.fetchone():

            return jsonify({

                "success": False,

                "message":
                    "An account with this personal "
                    "email already exists."

            }), 409

        # -------------------------------------------------
        # HASH PASSWORD
        # -------------------------------------------------

        password_hash = (
            generate_password_hash(
                password
            )
        )

        # -------------------------------------------------
        # INSERT USER
        # -------------------------------------------------

        cursor.execute(
            """
            INSERT INTO users
            (
                full_name,
                shop_name,
                personal_email,
                shop_email,
                password_hash
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                full_name,
                shop_name,
                personal_email,
                shop_email or None,
                password_hash
            )
        )

        connection.commit()

        user_id = (
            cursor.lastrowid
        )

        # -------------------------------------------------
        # CREATE SESSION
        # -------------------------------------------------

        session["user_id"] = (
            user_id
        )

        session["full_name"] = (
            full_name
        )

        session["shop_name"] = (
            shop_name
        )

        return jsonify({

            "success": True,

            "message":
                "Account created successfully.",

            "user": {

                "full_name":
                    full_name,

                "shop_name":
                    shop_name,

                "personal_email":
                    personal_email
            }

        }), 201

    except Error as error:

        if connection:

            connection.rollback()

        return jsonify({

            "success": False,

            "message":
                f"Database error: {error}"

        }), 500

    finally:

        if cursor:

            cursor.close()

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
def login():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    personal_email = str(
        data.get(
            "personal_email",
            ""
        )
    ).strip().lower()

    password = data.get(
        "password",
        ""
    )

    # -----------------------------------------------------
    # EMAIL VALIDATION
    # -----------------------------------------------------

    if not valid_email(
        personal_email
    ):

        return jsonify({

            "success": False,

            "message":
                "Email must contain @ "
                "and end with .com."

        }), 400

    # -----------------------------------------------------
    # PASSWORD VALIDATION
    # -----------------------------------------------------

    if not valid_password(
        password
    ):

        return jsonify({

            "success": False,

            "message":
                "Password must be at least 8 characters "
                "and contain one digit and one special "
                "symbol from !,@,#,$,%,^,&,*."

        }), 400

    connection = None
    cursor = None

    try:

        connection = (
            get_db_connection()
        )

        cursor = connection.cursor(
            dictionary=True
        )

        cursor.execute(
            """
            SELECT
                id,
                full_name,
                shop_name,
                personal_email,
                password_hash

            FROM users

            WHERE personal_email = %s
            """,
            (
                personal_email,
            )
        )

        user = cursor.fetchone()

        # -------------------------------------------------
        # VERIFY PASSWORD
        # -------------------------------------------------

        if (
            not user
            or not check_password_hash(
                user["password_hash"],
                password
            )
        ):

            return jsonify({

                "success": False,

                "message":
                    "Invalid personal email or password."

            }), 401

        # -------------------------------------------------
        # CREATE SESSION
        # -------------------------------------------------

        session["user_id"] = (
            user["id"]
        )

        session["full_name"] = (
            user["full_name"]
        )

        session["shop_name"] = (
            user["shop_name"]
        )

        return jsonify({

            "success": True,

            "message":
                "Signed in successfully.",

            "user": {

                "full_name":
                    user["full_name"],

                "shop_name":
                    user["shop_name"],

                "personal_email":
                    user["personal_email"]
            }

        })

    except Error as error:

        return jsonify({

            "success": False,

            "message":
                f"Database error: {error}"

        }), 500

    finally:

        if cursor:

            cursor.close()

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# LOGOUT
# =========================================================

@app.post("/api/logout")
def logout():

    session.clear()

    return jsonify({

        "success": True,

        "message":
            "Signed out successfully."

    })


# =========================================================
# CURRENT USER
# =========================================================

@app.get("/api/me")
def current_user():

    if "user_id" not in session:

        return jsonify({

            "success": False,

            "authenticated": False

        }), 401

    return jsonify({

        "success": True,

        "authenticated": True,

        "user": {

            "full_name":
                session.get(
                    "full_name"
                ),

            "shop_name":
                session.get(
                    "shop_name"
                )

        }

    })


# =========================================================
# GEMINI AUDIO TRANSACTION ANALYSIS
# =========================================================

@app.post("/api/analyze-transaction")
@login_required
def analyze_transaction():

    # -----------------------------------------------------
    # CHECK GEMINI
    # -----------------------------------------------------

    if gemini_client is None:

        return jsonify({

            "success": False,

            "message":
                "Gemini API key is not configured. "
                "Add GEMINI_API_KEY to your .env file."

        }), 503

    # -----------------------------------------------------
    # CHECK AUDIO FILE
    # -----------------------------------------------------

    if "audio" not in request.files:

        return jsonify({

            "success": False,

            "message":
                "No audio file was received."

        }), 400

    audio_file = request.files[
        "audio"
    ]

    if not audio_file:

        return jsonify({

            "success": False,

            "message":
                "The audio file is empty."

        }), 400

    # -----------------------------------------------------
    # READ AUDIO
    # -----------------------------------------------------

    audio_bytes = (
        audio_file.read()
    )

    if not audio_bytes:

        return jsonify({

            "success": False,

            "message":
                "The recorded audio contains no data."

        }), 400

    # -----------------------------------------------------
    # AUDIO SIZE
    # -----------------------------------------------------

    MAX_AUDIO_SIZE = (
        20 * 1024 * 1024
    )

    if len(audio_bytes) > MAX_AUDIO_SIZE:

        return jsonify({

            "success": False,

            "message":
                "Audio file is too large. "
                "Maximum allowed size is 20 MB."

        }), 413

    # -----------------------------------------------------
    # MIME TYPE
    # -----------------------------------------------------

    mime_type = (
        audio_file.mimetype
        or "audio/webm"
    ).lower().split(";")[0].strip()

    supported_audio_types = {

        "audio/webm",
        "audio/wav",
        "audio/x-wav",
        "audio/mp3",
        "audio/mpeg",
        "audio/ogg",
        "audio/aac",
        "audio/flac",
        "audio/mp4",
        "audio/m4a"
    }

    if mime_type not in supported_audio_types:

        return jsonify({

            "success": False,

            "message":
                f"Unsupported audio type: {mime_type}"

        }), 400

    # -----------------------------------------------------
    # SEND AUDIO TO GEMINI
    # -----------------------------------------------------

    try:

        audio_part = (
            types.Part.from_bytes(
                data=audio_bytes,
                mime_type=mime_type
            )
        )

        response = (
            gemini_client
            .models
            .generate_content(

                model=GEMINI_MODEL,

                contents=[
                    TRANSACTION_PROMPT,
                    audio_part
                ],

                config=(
                    types.GenerateContentConfig(

                        response_mime_type=
                            "application/json",

                        response_schema=
                            TRANSACTION_SCHEMA
                    )
                )
            )
        )

        # -------------------------------------------------
        # GET GEMINI RESPONSE
        # -------------------------------------------------

        response_text = (
            response.text
            or ""
        ).strip()

        if not response_text:

            return jsonify({

                "success": False,

                "message":
                    "Gemini returned an empty response."

            }), 502

        # -------------------------------------------------
        # PARSE JSON
        # -------------------------------------------------

        try:

            transaction = (
                json.loads(
                    response_text
                )
            )

        except json.JSONDecodeError:

            print(
                "Gemini returned invalid JSON:"
            )

            print(
                response_text
            )

            return jsonify({

                "success": False,

                "message":
                    "Gemini returned invalid JSON."

            }), 502

        # =================================================
        # VALIDATE CUSTOMER NAME
        # =================================================

        customer_name = (
            transaction.get(
                "customer_name"
            )
        )

        needs_clarification = bool(
            transaction.get(
                "needs_clarification",
                False
            )
        )

        clarification_message = (
            transaction.get(
                "clarification_message"
            )
        )

        if (
            customer_name is not None
            and not isinstance(
                customer_name,
                str
            )
        ):

            customer_name = None

            needs_clarification = True

            clarification_message = (
                "Customer name could not be identified."
            )

        if (
            isinstance(
                customer_name,
                str
            )
            and not customer_name.strip()
        ):

            customer_name = None

            needs_clarification = True

            clarification_message = (
                "Customer name could not be identified."
            )

        # =================================================
        # VALIDATE AMOUNT
        # =================================================

        amount = (
            transaction.get(
                "amount"
            )
        )

        if amount is not None:

            try:

                amount = float(
                    amount
                )

            except (
                TypeError,
                ValueError
            ):

                amount = None

                needs_clarification = True

                clarification_message = (
                    "Transaction amount could not "
                    "be identified."
                )

        if (
            amount is not None
            and amount <= 0
        ):

            amount = None

            needs_clarification = True

            clarification_message = (
                "Transaction amount must be "
                "greater than zero."
            )

        # =================================================
        # VALIDATE TRANSACTION MODE
        # =================================================

        mode = transaction.get(
            "mode"
        )

        if mode not in {
            "debt",
            "credit"
        }:

            mode = None

            needs_clarification = True

            clarification_message = (
                "It is unclear whether the customer "
                "paid or will pay later."
            )

        # =================================================
        # FINAL REQUIRED-FIELD CHECK
        # =================================================

        if (
            customer_name is None
            or amount is None
            or mode is None
        ):

            needs_clarification = True

        # =================================================
        # NORMALIZE RESULT
        # =================================================

        transaction["customer_name"] = (
            customer_name
        )

        transaction["amount"] = (

            round(
                amount,
                2
            )

            if amount is not None
            else None
        )

        transaction["mode"] = (
            mode
        )

        transaction["needs_clarification"] = (
            needs_clarification
        )

        transaction["clarification_message"] = (
            clarification_message
        )

        # =================================================
        # RETURN RESULT
        # =================================================

        return jsonify({

            "success": True,

            "result":
                transaction

        }), 200

    except Exception as error:

        print(
            "Gemini analysis error:"
        )

        print(
            error
        )

        return jsonify({

            "success": False,

            "message":
                "Unable to analyze the recorded audio. "
                "Please try recording again."

        }), 500


# =========================================================
# CREATE TRANSACTION
# =========================================================

@app.post("/api/transactions")
@login_required
def create_transaction():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    customer_name = str(
        data.get(
            "customer_name",
            ""
        )
    ).strip()

    transaction_type = str(
        data.get(
            "transaction_type",
            ""
        )
    ).strip().lower()

    description = str(
        data.get(
            "description",
            ""
        )
    ).strip()

    # -----------------------------------------------------
    # AMOUNT
    # -----------------------------------------------------

    try:

        amount = float(
            data.get(
                "amount",
                0
            )
        )

    except (
        TypeError,
        ValueError
    ):

        amount = 0

    # -----------------------------------------------------
    # CUSTOMER VALIDATION
    # -----------------------------------------------------

    if not customer_name:

        return jsonify({

            "success": False,

            "message":
                "Customer name is required."

        }), 400

    # -----------------------------------------------------
    # AMOUNT VALIDATION
    # -----------------------------------------------------

    if amount <= 0:

        return jsonify({

            "success": False,

            "message":
                "Amount must be greater than zero."

        }), 400

    # -----------------------------------------------------
    # TRANSACTION TYPE VALIDATION
    # -----------------------------------------------------

    if transaction_type not in {
        "debt",
        "credit"
    }:

        return jsonify({

            "success": False,

            "message":
                "Transaction type must be debt or credit."

        }), 400

    connection = None
    cursor = None

    try:

        connection = (
            get_db_connection()
        )

        cursor = connection.cursor()

        # -------------------------------------------------
        # INSERT TRANSACTION
        # -------------------------------------------------

        cursor.execute(
            """
            INSERT INTO transactions
            (
                user_id,
                customer_name,
                amount,
                transaction_type,
                description
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                session["user_id"],
                customer_name,
                amount,
                transaction_type,
                description or None
            )
        )

        connection.commit()

        return jsonify({

            "success": True,

            "message":
                "Transaction recorded successfully."

        }), 201

    except Error as error:

        if connection:

            connection.rollback()

        return jsonify({

            "success": False,

            "message":
                f"Database error: {error}"

        }), 500

    finally:

        if cursor:

            cursor.close()

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# GET LEDGER
# =========================================================

@app.get("/api/ledger")
@login_required
def get_ledger():

    """
    Return debt and credit transactions separately.

    Transactions are sorted from newest to oldest.
    """

    connection = None
    cursor = None

    try:

        connection = (
            get_db_connection()
        )

        cursor = connection.cursor(
            dictionary=True
        )

        # =================================================
        # DEBT
        # =================================================

        cursor.execute(
            """
            SELECT
                id,
                customer_name,
                amount,
                transaction_type,
                description,
                transaction_date

            FROM transactions

            WHERE
                user_id = %s
                AND transaction_type = 'debt'

            ORDER BY
                transaction_date DESC,
                id DESC
            """,
            (
                session["user_id"],
            )
        )

        debt_rows = (
            cursor.fetchall()
        )

        # =================================================
        # CREDIT
        # =================================================

        cursor.execute(
            """
            SELECT
                id,
                customer_name,
                amount,
                transaction_type,
                description,
                transaction_date

            FROM transactions

            WHERE
                user_id = %s
                AND transaction_type = 'credit'

            ORDER BY
                transaction_date DESC,
                id DESC
            """,
            (
                session["user_id"],
            )
        )

        credit_rows = (
            cursor.fetchall()
        )

        # =================================================
        # CONVERT MYSQL VALUES TO JSON-FRIENDLY VALUES
        # =================================================

        for row in (
            debt_rows + credit_rows
        ):

            row["amount"] = float(
                row["amount"]
            )

            if isinstance(
                row["transaction_date"],
                datetime
            ):

                row["transaction_date"] = (
                    row["transaction_date"]
                    .strftime(
                        "%d-%m-%Y %I:%M %p"
                    )
                )

        return jsonify({

            "success": True,

            "debt":
                debt_rows,

            "credit":
                credit_rows

        })

    except Error as error:

        return jsonify({

            "success": False,

            "message":
                f"Database error: {error}"

        }), 500

    finally:

        if cursor:

            cursor.close()

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# 413 REQUEST TOO LARGE
# =========================================================

@app.errorhandler(413)
def request_too_large(error):

    return jsonify({

        "success": False,

        "message":
            "The uploaded audio is too large. "
            "Maximum allowed size is 20 MB."

    }), 413


# =========================================================
# START APPLICATION
# =========================================================

if __name__ == "__main__":

    try:

        initialize_database()

        print(
            "MySQL connection successful."
        )

        print(
            "Database tables are ready."
        )

        if gemini_client is not None:

            print(
                "Gemini API configuration loaded."
            )

        else:

            print(
                "WARNING: GEMINI_API_KEY is not configured."
            )

    except Error as error:

        print(
            "MySQL connection failed."
        )

        print(
            f"Error: {error}"
        )

        raise SystemExit(1)

    except Exception as error:

        print(
            "Application initialization failed."
        )

        print(
            f"Error: {error}"
        )

        raise SystemExit(1)

    app.run(
        debug=True
    )