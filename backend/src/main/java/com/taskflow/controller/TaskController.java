package com.taskflow.controller;

import com.taskflow.model.Task;
import com.taskflow.repository.TaskRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class TaskController {

    private final TaskRepository taskRepository;
    private final RestTemplate restTemplate;

    @Value("${HOSTNAME:unknown}")
    private String hostname;

    @Value("${notification.service.url:http://notification-service:5000}")
    private String notificationServiceUrl;

    public TaskController(TaskRepository taskRepository, RestTemplate restTemplate) {
        this.taskRepository = taskRepository;
        this.restTemplate = restTemplate;
    }

    // --- Health (accessible at both /health and /api/health) ---
    @GetMapping({"/health", "/api/health"})
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("service", "backend-api");
        status.put("instance", hostname);
        status.put("timestamp", Instant.now().toString());
        try {
            long count = taskRepository.count(); // tests DB connection
            status.put("status", "UP");
            status.put("database", "UP");
            status.put("taskCount", count);
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            status.put("status", "DEGRADED");
            status.put("database", "DOWN");
            status.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(status);
        }
    }

    // --- GET /api/tasks ---
    @GetMapping("/api/tasks")
    public ResponseEntity<Map<String, Object>> tasks() {
        try {
            List<Map<String, Object>> tasks = taskRepository.findAll().stream()
                    .map(task -> {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("id", task.getId());
                        item.put("title", task.getTitle());
                        item.put("status", task.getStatus());
                        return item;
                    })
                    .toList();
            return ResponseEntity.ok(Map.of(
                    "service", "backend-api",
                    "instance", hostname,
                    "tasks", tasks
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "error", "Database unavailable",
                    "details", e.getMessage(),
                    "instance", hostname
            ));
        }
    }

    // --- POST /api/tasks ---
    @PostMapping("/api/tasks")
    public ResponseEntity<Map<String, Object>> createTask(@RequestBody Map<String, String> payload) {
        try {
            String title = payload.getOrDefault("title", "New Task");
            String taskStatus = payload.getOrDefault("status", "todo");
            Task saved = taskRepository.save(new Task(title, taskStatus));
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("id", saved.getId());
            response.put("title", saved.getTitle());
            response.put("status", saved.getStatus());
            response.put("instance", hostname);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "error", "Database unavailable",
                    "details", e.getMessage()
            ));
        }
    }

    // --- POST /api/notify ---
    @PostMapping("/api/notify")
    public ResponseEntity<Map<String, Object>> notifyService(@RequestBody(required = false) Map<String, Object> payload) {
        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("source", "backend-api");
        requestBody.put("instance", hostname);
        requestBody.put("timestamp", Instant.now().toString());
        requestBody.put("payload", payload == null ? Map.of("message", "Test notification") : payload);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    notificationServiceUrl + "/notify",
                    requestBody,
                    Map.class
            );
            return ResponseEntity.ok(Map.of(
                    "service", "backend-api",
                    "instance", hostname,
                    "notificationResponse", response.getBody()
            ));
        } catch (Exception e) {
            // Log the webhook but don't fail – alertmanager may send here
            System.err.println("[ALERT] Notification failed: " + e.getMessage());
            System.err.println("[ALERT] Payload: " + requestBody);
            return ResponseEntity.ok(Map.of(
                    "service", "backend-api",
                    "instance", hostname,
                    "status", "logged",
                    "warning", "Notification service unreachable, alert logged to stderr"
            ));
        }
    }

    // --- POST /api/data (efficient large-body handler for load tests) ---
    @PostMapping("/api/data")
    public ResponseEntity<Map<String, Object>> dataEndpoint(HttpServletRequest request) {
        try {
            InputStream in = request.getInputStream();
            byte[] buffer = new byte[8192];
            long totalBytes = 0;
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                totalBytes += bytesRead;
            }
            return ResponseEntity.ok(Map.of(
                    "status", "received",
                    "bytesReceived", totalBytes,
                    "instance", hostname
            ));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error", e.getMessage()
            ));
        }
    }

    // --- Seed initial data ---
    @Bean
    CommandLineRunner initData(TaskRepository repository) {
        return args -> {
            if (repository.count() == 0) {
                repository.save(new Task("Projektstruktur anlegen", "done"));
                repository.save(new Task("Backend implementieren", "in_progress"));
                repository.save(new Task("Monitoring konfigurieren", "in_progress"));
                repository.save(new Task("Lasttests durchführen", "todo"));
                repository.save(new Task("Dokumentation erstellen", "todo"));
            }
        };
    }
}