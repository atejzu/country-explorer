package si.atejzu.countryexplorer.common.error;

import org.junit.jupiter.api.Test;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.DatabindException;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueSerializer;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.module.SimpleModule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {
    @Test
    void actualJacksonSerializationFailureHasSanitizedFrameworkProblem() throws Exception {
        var module = new SimpleModule();
        module.addSerializer(BrokenResponse.class, new ValueSerializer<BrokenResponse>() {
            @Override
            public void serialize(BrokenResponse value, JsonGenerator generator, SerializationContext context) {
                // Fail before writing response bytes so MVC can still return a complete error response.
                throw DatabindException.from(generator, "private serialization implementation details",
                        new IllegalStateException("private serializer cause"));
            }
        });
        var mapper = JsonMapper.builder().addModule(module).build();
        var mvc = MockMvcBuilders.standaloneSetup(new SerializationController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new JacksonJsonHttpMessageConverter(mapper)).build();

        mvc.perform(get("/api/v1/countries")).andExpect(status().isInternalServerError())
                .andExpect(result -> assertThat(result.getResolvedException())
                        .isInstanceOf(HttpMessageNotWritableException.class)
                        .hasRootCauseInstanceOf(IllegalStateException.class))
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(content().json("""
                        {"type":"about:blank","title":"Internal server error","status":500,
                         "detail":"An unexpected error occurred.","instance":"/api/v1/countries",
                         "code":"INTERNAL_ERROR"}
                        """, JsonCompareMode.STRICT))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                        .doesNotContain("private", "serialization", "IllegalStateException", "stackTrace"));
    }

    record BrokenResponse() {}

    @RestController
    static class SerializationController {
        @GetMapping("/api/v1/countries")
        BrokenResponse countries() {
            return new BrokenResponse();
        }
    }
}
