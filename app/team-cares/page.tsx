"use client";

import InnerFooter from "../components/InnerFooter";
import { RichText } from "../components/RichText";
import { useSiteContent } from "../components/SiteContentProvider";
import { TEAM_PHOTOS } from "../lib/site-content";

const photoKeys = Array.from({ length: TEAM_PHOTOS }, (_, i) => `team.photo${i + 1}.image`);
/** Las primeras 6 fotos acompañan la presentación; el resto, la escuela (como en la web original). */
const INTRO_PHOTOS = 6;

export default function TeamCaresPage() {
  const t = useSiteContent();
  const gallery = (keys: string[], alt: string) => (
    <ul className="team-gallery">
      {keys.map((key, i) => <li key={key}><img src={t(key)} alt={`${alt} (${i + 1})`} loading="lazy" width={400} height={400} /></li>)}
    </ul>
  );

  return (
    <>
      <main className="inner-page team-page">
        <section className="page-intro wrap">
          <div>
            <p className="eyebrow">{t("team.eyebrow")}</p>
            <h1><RichText value={t("team.title")} /></h1>
          </div>
          <p>{t("team.intro1")}</p>
        </section>

        <section className="wrap team-section">
          <div className="team-copy">
            <p>{t("team.intro2")}</p>
            <p>{t("team.intro3")}</p>
            <p>{t("team.intro4")}</p>
          </div>
          {gallery(photoKeys.slice(0, INTRO_PHOTOS), "Partido del equipo Team Cares")}
        </section>

        <section className="wrap team-section team-school">
          <p className="eyebrow">Escuela de fútbol</p>
          <h2>{t("team.school.title")}</h2>
          <div className="team-copy">
            <p>{t("team.school.text1")}</p>
            <p>{t("team.school.text2")}</p>
          </div>
          {gallery(photoKeys.slice(INTRO_PHOTOS), "Escuela de Fútbol Deportivo Malalhue")}
        </section>
      </main>
      <InnerFooter />
    </>
  );
}
