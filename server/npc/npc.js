class NPC {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.role = data.role;
        this.locationId = data.locationId;
        this.personality = data.personality;
        this.background = data.background;
        this.fears = data.fears;
        this.desires = data.desires;
        this.quirks = data.quirks;
        
        // Conversión a camelCase para las propiedades que venían con guion bajo
        this.speechStyle = data.speech_style || data.speechStyle;
        
        this.relationships = data.relationships;
        this.secret = data.secret;
        this.hint = data.hint;
        this.color = data.color;
        this.skin = data.skin;
        this.hair = data.hair;
        this.outfit = data.outfit;
        this.suggestions = data.suggestions || [];
        this.appearancePrompt = data.appearancePrompt;
        this.romance = data.romance || null;
        this.routine = data.routine || {};
        
        this.shortTermGoal = data.shortTermGoal;
        this.longTermGoal = data.longTermGoal;
        this.shortTermGoalProgress = data.shortTermGoalProgress || [];
        this.longTermGoalProgress = data.longTermGoalProgress || [];
        this.goalProgress = data.goalProgress;
    }

    // Método para obtener dónde está el NPC según la hora
    getUbicacion(turno) {
        return this.routine[turno] || this.locationId;
    }

    // Método para comprobar si se cumplen los requisitos de romance
    puedeIniciarRomance(eventoCompletado) {
        if (!this.romance || !this.romance.romanceable) return false;
        return eventoCompletado === 'presion_emisario';
    }
}