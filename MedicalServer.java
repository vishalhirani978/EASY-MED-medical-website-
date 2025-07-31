import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

public class MedicalServer {
    private static Connection connection;

    public static void main(String[] args) throws Exception {
        // Initialize SQLite connection
        initDatabase();

        // Create HTTP server
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        // Contexts for API endpoints
        server.createContext("/doctors/categories", new DoctorCategoriesHandler());
        server.createContext("/doctors", new DoctorsHandler());
        server.createContext("/appointments", new AppointmentHandler());
        server.createContext("/patients/register", new PatientRegisterHandler());
        server.createContext("/patients/login", new PatientLoginHandler());
        server.createContext("/symptoms/check", new SymptomCheckHandler());

        server.setExecutor(null); // creates a default executor
        System.out.println("Server started at http://localhost:8000");
        server.start();
    }

    private static void initDatabase() throws SQLException {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException e) {
            System.err.println("SQLite JDBC driver not found.");
            System.exit(1);
        }
        connection = DriverManager.getConnection("jdbc:sqlite:medical.db");
        Statement stmt = connection.createStatement();

        // Create tables if not exist
        stmt.execute("CREATE TABLE IF NOT EXISTS doctors (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "name TEXT NOT NULL," +
                "category TEXT NOT NULL," +
                "experience INTEGER NOT NULL," +
                "phone TEXT NOT NULL" +
                ")");

        stmt.execute("CREATE TABLE IF NOT EXISTS patients (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "patient_name TEXT NOT NULL," +
                "father_name TEXT NOT NULL," +
                "cnic TEXT UNIQUE NOT NULL," +
                "email TEXT UNIQUE NOT NULL," +
                "password TEXT NOT NULL," +
                "phone TEXT NOT NULL," +
                "age INTEGER NOT NULL," +
                "disease TEXT NOT NULL" +
                ")");

        stmt.execute("CREATE TABLE IF NOT EXISTS appointments (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "doctor_id INTEGER NOT NULL," +
                "patient_id INTEGER NOT NULL," +
                "date TEXT NOT NULL," +
                "time TEXT NOT NULL," +
                "message TEXT," +
                "disease TEXT NOT NULL," +
                "FOREIGN KEY(doctor_id) REFERENCES doctors(id)," +
                "FOREIGN KEY(patient_id) REFERENCES patients(id)" +
                ")");

        stmt.execute("CREATE TABLE IF NOT EXISTS symptoms (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "patient_id INTEGER NOT NULL," +
                "symptoms TEXT NOT NULL," +
                "medicines TEXT NOT NULL," +
                "FOREIGN KEY(patient_id) REFERENCES patients(id)" +
                ")");

        stmt.close();
    }

    // Utility to read request body
    private static String readRequestBody(InputStream is) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while((line = br.readLine()) != null) {
            sb.append(line);
        }
        return sb.toString();
    }

    // Utility to send JSON response
    private static void sendJsonResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }

    // Handler for /doctors/categories
    static class DoctorCategoriesHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            try {
                Statement stmt = connection.createStatement();
                ResultSet rs = stmt.executeQuery("SELECT DISTINCT category FROM doctors");
                List<String> categories = new ArrayList<>();
                while (rs.next()) {
                    categories.add(rs.getString("category"));
                }
                rs.close();
                stmt.close();
                String json = toJsonArray(categories);
                sendJsonResponse(exchange, 200, json);
            } catch (SQLException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }
    }

    // Handler for /doctors?category=...
    static class DoctorsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            URI uri = exchange.getRequestURI();
            String query = uri.getQuery();
            String category = null;
            if (query != null) {
                for (String param : query.split("&")) {
                    String[] pair = param.split("=");
                    if (pair.length == 2 && "category".equals(pair[0])) {
                        category = java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
                    }
                }
            }
            if (category == null) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            try {
                PreparedStatement ps = connection.prepareStatement("SELECT id, name, experience, phone FROM doctors WHERE category = ?");
                ps.setString(1, category);
                ResultSet rs = ps.executeQuery();
                List<Map<String, Object>> doctors = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> doc = new HashMap<>();
                    doc.put("id", rs.getInt("id"));
                    doc.put("name", rs.getString("name"));
                    doc.put("experience", rs.getInt("experience"));
                    doc.put("phone", rs.getString("phone"));
                    doctors.add(doc);
                }
                rs.close();
                ps.close();
                String json = toJsonArrayOfObjects(doctors);
                sendJsonResponse(exchange, 200, json);
            } catch (SQLException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }
    }

    // Handler for POST /appointments
    static class AppointmentHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String body = readRequestBody(exchange.getRequestBody());
            Map<String, String> data = parseJson(body);
        if (data == null || !data.containsKey("doctorCategory") || !data.containsKey("doctor") ||
                !data.containsKey("patientId") || !data.containsKey("date") || !data.containsKey("time") ||
                !data.containsKey("disease")) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            try {
                // Find doctor id by name and category
                PreparedStatement psDoc = connection.prepareStatement("SELECT id FROM doctors WHERE name = ? AND category = ?");
                psDoc.setString(1, data.get("doctor"));
                psDoc.setString(2, data.get("doctorCategory"));
                ResultSet rsDoc = psDoc.executeQuery();
                if (!rsDoc.next()) {
                    sendJsonResponse(exchange, 400, "Doctor not found");
                    rsDoc.close();
                    psDoc.close();
                    return;
                }
                int doctorId = rsDoc.getInt("id");
                rsDoc.close();
                psDoc.close();

                int patientId = Integer.parseInt(data.get("patientId"));
                String date = data.get("date");
                String time = data.get("time");
                String disease = data.get("disease");
                String message = data.getOrDefault("message", "");

                PreparedStatement ps = connection.prepareStatement("INSERT INTO appointments (doctor_id, patient_id, date, time, message, disease) VALUES (?, ?, ?, ?, ?, ?)");
                ps.setInt(1, doctorId);
                ps.setInt(2, patientId);
                ps.setString(3, date);
                ps.setString(4, time);
                ps.setString(5, message);
                ps.setString(6, disease);
                ps.executeUpdate();
                ps.close();

                sendJsonResponse(exchange, 200, "{\"message\":\"Appointment booked successfully\"}");
            } catch (SQLException | NumberFormatException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }
    }

    // Handler for POST /patients/register
    static class PatientRegisterHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String body = readRequestBody(exchange.getRequestBody());
            Map<String, String> data = parseJson(body);
        if (data == null || !data.containsKey("patientName") || !data.containsKey("fatherName") ||
                !data.containsKey("cnic") || !data.containsKey("email") || !data.containsKey("password") ||
                !data.containsKey("phone") || !data.containsKey("age") ||
                !data.containsKey("disease")) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            try {
                PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO patients (patient_name, father_name, cnic, email, password, phone, age, disease) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
                ps.setString(1, data.get("patientName"));
                ps.setString(2, data.get("fatherName"));
                ps.setString(3, data.get("cnic"));
                ps.setString(4, data.get("email"));
                ps.setString(5, data.get("password"));
                ps.setString(6, data.get("phone"));
                ps.setInt(7, Integer.parseInt(data.get("age")));
                ps.setString(8, data.get("disease"));
                ps.executeUpdate();
                ResultSet rs = ps.getGeneratedKeys();
                int patientId = -1;
                if (rs.next()) {
                    patientId = rs.getInt(1);
                }
                rs.close();
                ps.close();

                sendJsonResponse(exchange, 200, "{\"patientId\":" + patientId + "}");
            } catch (SQLException | NumberFormatException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }
    }

    // Handler for POST /patients/login
    static class PatientLoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String body = readRequestBody(exchange.getRequestBody());
            Map<String, String> data = parseJson(body);
            if (data == null || !data.containsKey("loginCnic")) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            try {
                String loginCnic = data.get("loginCnic");
                PreparedStatement ps = connection.prepareStatement(
                    "SELECT id FROM patients WHERE cnic = ? OR phone = ?");
                ps.setString(1, loginCnic);
                ps.setString(2, loginCnic);
                ResultSet rs = ps.executeQuery();
                if (rs.next()) {
                    int patientId = rs.getInt("id");
                    rs.close();
                    ps.close();
                    sendJsonResponse(exchange, 200, "{\"patientId\":" + patientId + "}");
                } else {
                    rs.close();
                    ps.close();
                    sendJsonResponse(exchange, 401, "Invalid CNIC or phone number");
                }
            } catch (SQLException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }
    }

    // Handler for POST /symptoms/check
    static class SymptomCheckHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String body = readRequestBody(exchange.getRequestBody());
            Map<String, String> data = parseJson(body);
            if (data == null || !data.containsKey("patientId") || !data.containsKey("symptoms")) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            try {
                int patientId = Integer.parseInt(data.get("patientId"));
                String symptoms = data.get("symptoms");

                // For simplicity, suggest medicines based on keywords and age
                List<String> medicines = suggestMedicines(symptoms, patientId);

                // Save symptoms and medicines in DB
                PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO symptoms (patient_id, symptoms, medicines) VALUES (?, ?, ?)");
                ps.setInt(1, patientId);
                ps.setString(2, symptoms);
                ps.setString(3, String.join(", ", medicines));
                ps.executeUpdate();
                ps.close();

                String json = "{\"medicines\": [\"" + String.join("\", \"", medicines) + "\"]}";
                sendJsonResponse(exchange, 200, json);
            } catch (SQLException | NumberFormatException e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            }
        }

        private List<String> suggestMedicines(String symptoms, int patientId) throws SQLException {
            // Simple keyword-based medicine suggestion
            symptoms = symptoms.toLowerCase();
            List<String> meds = new ArrayList<>();
            if (symptoms.contains("fever")) {
                meds.add("Paracetamol");
            }
            if (symptoms.contains("cough")) {
                meds.add("Cough Syrup");
            }
            if (symptoms.contains("headache")) {
                meds.add("Ibuprofen");
            }
            if (meds.size() < 2) {
                meds.add("Multivitamins");
            }
            // Limit to 2 medicines
            return meds.subList(0, Math.min(2, meds.size()));
        }
    }

    // Simple JSON parser for flat JSON objects with string values
    private static Map<String, String> parseJson(String json) {
        Map<String, String> map = new HashMap<>();
        json = json.trim();
        if (!json.startsWith("{") || !json.endsWith("}")) {
            return null;
        }
        json = json.substring(1, json.length() - 1).trim();
        if (json.isEmpty()) {
            return map;
        }
        String[] pairs = json.split(",");
        for (String pair : pairs) {
            String[] kv = pair.split(":", 2);
            if (kv.length != 2) return null;
            String key = kv[0].trim();
            String value = kv[1].trim();
            if (key.startsWith("\"") && key.endsWith("\"")) {
                key = key.substring(1, key.length() - 1);
            }
            if (value.startsWith("\"") && value.endsWith("\"")) {
                value = value.substring(1, value.length() - 1);
            }
            map.put(key, value);
        }
        return map;
    }

    // Convert list of strings to JSON array string
    private static String toJsonArray(List<String> list) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        for (int i = 0; i < list.size(); i++) {
            sb.append("\"").append(list.get(i)).append("\"");
            if (i < list.size() - 1) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }

    // Convert list of maps to JSON array of objects string
    private static String toJsonArrayOfObjects(List<Map<String, Object>> list) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        for (int i = 0; i < list.size(); i++) {
            sb.append("{");
            Map<String, Object> map = list.get(i);
            int j = 0;
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                sb.append("\"").append(entry.getKey()).append("\":");
                if (entry.getValue() instanceof Number) {
                    sb.append(entry.getValue());
                } else {
                    sb.append("\"").append(entry.getValue()).append("\"");
                }
                if (j < map.size() - 1) sb.append(",");
                j++;
            }
            sb.append("}");
            if (i < list.size() - 1) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }
}