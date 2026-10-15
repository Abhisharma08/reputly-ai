import type { GoogleBusinessProfile } from "@/lib/google-profile";
export default function GoogleProfilePreview({
  profile,
}: {
  profile: GoogleBusinessProfile;
}) {
  return (
    <section
      className="google-profile-preview"
      aria-label="Google business profile"
    >
      <div className="google-profile-title">
        <strong>{profile.name}</strong>
        <span>{profile.category}</span>
      </div>
      {profile.address && <p>{profile.address}</p>}
      {profile.about && <p>{profile.about}</p>}
      {profile.offerings.length > 0 && <p>{profile.offerings.join(" · ")}</p>}
      {profile.website && (
        <p>
          <a href={profile.website} target="_blank" rel="noopener noreferrer">
            Business website ↗
          </a>
        </p>
      )}
      {profile.phone && <p>{profile.phone}</p>}
      {profile.hours.length > 0 && (
        <details>
          <summary>Opening hours</summary>
          <ul>
            {profile.hours.map((day) => (
              <li key={day}>{day}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="google-attribution">
        <a href={profile.maps_url} target="_blank" rel="noopener noreferrer">
          Google Maps ↗
        </a>
        {profile.attributions.map((item, index) =>
          item.url ? (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {" "}
              · {item.name}
            </a>
          ) : (
            <span key={index}> · {item.name}</span>
          ),
        )}
      </p>
    </section>
  );
}
