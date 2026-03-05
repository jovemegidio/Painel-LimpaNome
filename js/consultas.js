// js/consultas.js
// Funções de consulta CPF/Bacen via backend com autenticação

async function consultarCPFReal(cpf, nomeCompleto) {
    try {
        const token = DB.getToken ? DB.getToken() : localStorage.getItem('mi2_token');
        const response = await fetch('/api/services/consultar-cpf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ cpf, nome: nomeCompleto })
        });
        if (!response.ok) throw new Error('Erro ao consultar CPF');
        return await response.json();
    } catch (error) {
        return { status: 'erro', mensagem: error.message };
    }
}

async function consultarBacenReal(cpf) {
    try {
        const token = DB.getToken ? DB.getToken() : localStorage.getItem('mi2_token');
        const response = await fetch('/api/services/consultar-bacen', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ cpf })
        });
        if (!response.ok) throw new Error('Erro ao consultar Bacen');
        return await response.json();
    } catch (error) {
        return { status: 'erro', mensagem: error.message };
    }
}
