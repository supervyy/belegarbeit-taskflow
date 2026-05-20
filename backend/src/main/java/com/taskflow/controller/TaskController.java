package com.taskflow.controller;

import com.taskflow.model.Task;
import com.taskflow.repository.TaskRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

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

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "service", "backend-api",
                "instance", hostname
        );
    }

    @GetMapping("/api/tasks")
    public Map<String, Object> tasks() {
        List<Map<String, Object>> tasks = taskRepository.findAll().stream()
                .map(task -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", task.getId());
                    item.put("title", task.getTitle());
                    item.put("status", task.getStatus());
                    return item;
                })
                .toList();

        return Map.of(
                "service", "backend-api",
                "instance", hostname,
                "tasks", tasks
        );
    }

    @PostMapping("/api/notify")
    public Map<String, Object> notifyService(@RequestBody(required = false) Map<String, Object> payload) {
        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("source", "backend-api");
        requestBody.put("instance", hostname);
        requestBody.put("payload", payload == null ? Map.of("message", "Test notification") : payload);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                notificationServiceUrl + "/notify",
                requestBody,
                Map.class
        );

        return Map.of(
                "service", "backend-api",
                "instance", hostname,
                "notificationResponse", response.getBody()
        );
    }

    @Bean
    CommandLineRunner initData(TaskRepository repository) {
        return args -> {
            if (repository.count() == 0) {
                repository.save(new Task("Projektstruktur anlegen", "done"));
                repository.save(new Task("Backend implementieren", "in_progress"));
                repository.save(new Task("Monitoring konfigurieren", "todo"));
            }
        };
    }
}