package si.atejzu.countryexplorer.discussion.api;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

// Setter binding distinguishes an omitted field from an explicitly supplied null.
public final class UpdateDiscussionRequest {
    @Size(min = 5, max = 150)
    private String title;
    @Size(max = 5000)
    private String body;

    @JsonSetter(nulls = Nulls.FAIL)
    public void setTitle(String title) { this.title = title; }

    @JsonSetter(nulls = Nulls.FAIL)
    public void setBody(String body) { this.body = body; }

    public String title() { return title; }
    public String body() { return body; }

    @AssertTrue(message = "Supply a nonblank title, body, or both.")
    public boolean isContentValid() {
        return (title != null || body != null)
                && (title == null || !title.isBlank()) && (body == null || !body.isBlank());
    }
}
