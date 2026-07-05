// services/twistResolver.js

const TWIST_CHANCE = 0.15;

const TWISTS = [

    {
        id: "npc_intrusion",
        title: "INTRUSIÓN INESPERADA",
        prompt:
            `Un NPC aleatorio de la aldea (que no estaba participando)
             irrumpe de golpe en la escena o interrumpe la conversación
             con una noticia urgente, una acusación dramática o una
             exigencia extraña.

             El DM debe forzar a este NPC a ingresar en
             "enterTheConversation" y hacerlo hablar.`
    },

    {
        id: "accident",
        title: "ACCIDENTE O DESASTRE INESPERADO",
        prompt:
            `Algo sale repentina y cómicamente mal en el entorno.

             Puede romperse un barril, soltarse un caballo,
             derrumbarse una estantería, etc.

             Los personajes deben reaccionar.`
    },

    {
        id: "good_luck",
        title: "GOLPE DE SUERTE",
        prompt:
            `Algo sale inesperadamente bien.

             Puede aparecer una moneda de oro,
             un NPC regalar un objeto,
             descubrir una pista importante
             o resolverse un problema menor.`
    },

    {
        id: "external_disturbance",
        title: "DISTURBIO EXTERNO",
        prompt:
            `Se escucha un ruido lejano,
             un grito,
             un estruendo
             o alguna perturbación proveniente
             de otra ubicación.

             Los personajes deben reaccionar
             con curiosidad o preocupación.`
    }

];

export function resolve(context) {

    context.twist = null;

    if (Math.random() > TWIST_CHANCE) {
        return;
    }

    const twist =
        TWISTS[Math.floor(Math.random() * TWISTS.length)];

    context.twist = twist;

    context.unexpectedEventNote = `
    === EVENTO INESPERADO ===

    ATENCIÓN:

    Para este turno debes integrar obligatoriamente
    el siguiente giro narrativo.

    ${twist.title}
    ${twist.prompt}

    `;

    console.log(
        `[TwistEngine] ${twist.id}`
    );

}