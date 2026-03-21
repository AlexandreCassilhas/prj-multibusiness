
// Funções idênticas ao admin.js para manter o padrão
      function mascaraCPF(input) {
          let value = input.value.replace(/\D/g, "");
          value = value.replace(/(\d{3})(\d)/, "$1.$2");
          value = value.replace(/(\d{3})(\d)/, "$1.$2");
          value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
          input.value = value;
      }

      function validarCPF(cpf) {
          cpf = cpf.replace(/[^\d]+/g, ''); 
          if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false; 
          let soma = 0, resto;
          for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
          resto = (soma * 10) % 11;
          if ((resto === 10) || (resto === 11)) resto = 0;
          if (resto !== parseInt(cpf.substring(9, 10))) return false;
          soma = 0;
          for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
          resto = (soma * 10) % 11;
          if ((resto === 10) || (resto === 11)) resto = 0;
          if (resto !== parseInt(cpf.substring(10, 11))) return false;
          return true;
      }

      // Carregar CAPTCHA ao abrir
      function reloadCaptcha() {
          fetch('http://localhost:3000/captcha')
              .then(res => res.text())
              .then(svg => document.getElementById('captcha-img-container').innerHTML = svg);
      }
      
      document.getElementById('captcha-img-container').onclick = reloadCaptcha;
      reloadCaptcha();

      // Submit do formulário de login
      document.getElementById('formLogin').onsubmit = async (e) => {
          e.preventDefault(); // Impede o recarregamento da página
          const loginOriginal = document.getElementById('userLogin').value;
          const cpfLimpo = loginOriginal.replace(/[^\d]+/g, ''); // Garante envio apenas de números
          const senha = document.getElementById('userPass').value;
          const captcha = document.getElementById('captchaInput').value;

          // 🛡️ VALIDAÇÃO DE SEGURANÇA NO FRONTEND
          if (!validarCPF(cpfLimpo)) {
              document.getElementById('msg-erro').innerText = "CPF Inválido! Verifique os números.";
              return;
          }

          const response = await fetch('http://localhost:3000/login', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              // Enviamos o CPF limpo para o server.js
              body: JSON.stringify({ login: cpfLimpo, senha, captcha }) 
          });

          const data = await response.json();

          // Se Perfil "Administrador" || "Administrador Empresas" -> Dashboard, senão -> "Venda"
          if (response.ok) {

            const userToStore = {
                id: data.id,
                user: data.user,
                perfis: data.perfis, // Array de perfis que já implementou
                foto: data.foto,
                empresa_id: data.empresa_id, // Informação da Empresa
                foto_logo: data.foto_logo,
                nome_fantasia: data.nome_fantasia,
                cnpj: data.cnpj
            };
            
            localStorage.setItem('polifonia_user', JSON.stringify(userToStore));
            // localStorage.setItem('polifonia_user', JSON.stringify(data));

              if(!data.perfis.includes('Administrador') && !data.perfis.includes('Administrador Empresas')) {
                window.location.href = 'venda.html';
              } else {
                window.location.href = 'dashboard.html';
              };
             
          } else {
              document.getElementById('msg-erro').innerText = data.message;
              reloadCaptcha();
          }
      }
      