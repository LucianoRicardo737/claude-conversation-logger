#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import RecoveryManager from '../utils/recovery-manager.js';
import chalk from 'chalk';
import Table from 'cli-table3';

const program = new Command();

program
    .name('recovery-cli')
    .description('Claude Conversation Logger - Recovery Management CLI')
    .version('1.0.0');

// Configuración global
let recoveryManager;

async function initRecoveryManager() {
    if (!recoveryManager) {
        recoveryManager = new RecoveryManager();
        await recoveryManager.initialize();
    }
    return recoveryManager;
}

// Comando para crear backup
program
    .command('backup')
    .description('Create a system backup')
    .option('-n, --name <name>', 'Custom backup name')
    .option('-a, --auto', 'Create automatic backup without confirmation')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Initializing backup process...'));
            
            const manager = await initRecoveryManager();
            
            if (!options.auto) {
                const confirm = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Do you want to create a system backup?',
                    default: true
                }]);
                
                if (!confirm.proceed) {
                    console.log(chalk.yellow('⚠️  Backup cancelled by user'));
                    return;
                }
            }
            
            const backupInfo = await manager.createSystemBackup(options.name);
            
            console.log(chalk.green('✅ Backup completed successfully!'));
            console.log(chalk.cyan('📊 Backup Statistics:'));
            console.log(`   📁 Name: ${backupInfo.name}`);
            console.log(`   📅 Created: ${new Date(backupInfo.timestamp).toLocaleString()}`);
            console.log(`   💬 Messages: ${backupInfo.stats.total_messages}`);
            console.log(`   🗂️  Sessions: ${backupInfo.stats.total_sessions}`);
            console.log(`   📦 Projects: ${backupInfo.stats.projects_count}`);
            console.log(`   💾 Size: ${backupInfo.stats.file_size_mb} MB`);
            
        } catch (error) {
            console.error(chalk.red('❌ Backup failed:'), error.message);
            process.exit(1);
        }
    });

// Comando para listar backups
program
    .command('list')
    .alias('ls')
    .description('List available backups')
    .option('-d, --details', 'Show detailed information')
    .action(async (options) => {
        try {
            const manager = await initRecoveryManager();
            const backups = manager.listBackups();
            
            if (backups.length === 0) {
                console.log(chalk.yellow('⚠️  No backups found'));
                return;
            }
            
            if (options.details) {
                // Mostrar tabla detallada
                const table = new Table({
                    head: ['Name', 'Date', 'Messages', 'Sessions', 'Projects', 'Size (MB)'],
                    colWidths: [30, 20, 10, 10, 10, 12]
                });
                
                backups.forEach(backup => {
                    table.push([
                        backup.name,
                        new Date(backup.timestamp).toLocaleDateString(),
                        backup.stats.total_messages,
                        backup.stats.total_sessions,
                        backup.stats.projects_count,
                        backup.stats.file_size_mb
                    ]);
                });
                
                console.log(table.toString());
            } else {
                // Mostrar lista simple
                console.log(chalk.cyan('📦 Available Backups:'));
                backups.forEach((backup, index) => {
                    const date = new Date(backup.timestamp).toLocaleString();
                    console.log(chalk.white(`${index + 1}. ${backup.name}`));
                    console.log(chalk.gray(`   Created: ${date} | Messages: ${backup.stats.total_messages}`));
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error listing backups:'), error.message);
        }
    });

// Comando para restaurar backup
program
    .command('restore')
    .description('Restore from a backup')
    .option('-n, --name <name>', 'Backup name to restore')
    .option('--no-mongodb', 'Skip MongoDB restoration')
    .option('--no-redis', 'Skip Redis restoration')
    .option('-c, --clear', 'Clear existing data before restore')
    .action(async (options) => {
        try {
            const manager = await initRecoveryManager();
            const backups = manager.listBackups();
            
            if (backups.length === 0) {
                console.log(chalk.yellow('⚠️  No backups available for restoration'));
                return;
            }
            
            let backupName = options.name;
            
            // Si no se especifica nombre, mostrar lista para seleccionar
            if (!backupName) {
                const choices = backups.map(backup => ({
                    name: `${backup.name} (${new Date(backup.timestamp).toLocaleString()})`,
                    value: backup.name
                }));
                
                const selection = await inquirer.prompt([{
                    type: 'list',
                    name: 'backup',
                    message: 'Select backup to restore:',
                    choices
                }]);
                
                backupName = selection.backup;
            }
            
            // Confirmación de restauración
            const selectedBackup = backups.find(b => b.name === backupName);
            if (!selectedBackup) {
                console.log(chalk.red('❌ Backup not found'));
                return;
            }
            
            console.log(chalk.cyan('📋 Backup Details:'));
            console.log(`   📁 Name: ${selectedBackup.name}`);
            console.log(`   📅 Created: ${new Date(selectedBackup.timestamp).toLocaleString()}`);
            console.log(`   💬 Messages: ${selectedBackup.stats.total_messages}`);
            console.log(`   🗂️  Sessions: ${selectedBackup.stats.total_sessions}`);
            
            const restoreOptions = {
                restoreMongoDB: options.mongodb !== false,
                restoreRedis: options.redis !== false,
                clearBeforeRestore: options.clear
            };
            
            console.log(chalk.yellow('⚠️  Restoration Options:'));
            console.log(`   MongoDB: ${restoreOptions.restoreMongoDB ? 'Yes' : 'No'}`);
            console.log(`   Redis: ${restoreOptions.restoreRedis ? 'Yes' : 'No'}`);
            console.log(`   Clear existing data: ${restoreOptions.clearBeforeRestore ? 'Yes' : 'No'}`);
            
            const confirm = await inquirer.prompt([{
                type: 'confirm',
                name: 'proceed',
                message: 'Do you want to proceed with the restoration?',
                default: false
            }]);
            
            if (!confirm.proceed) {
                console.log(chalk.yellow('⚠️  Restoration cancelled by user'));
                return;
            }
            
            console.log(chalk.blue('🔄 Starting restoration process...'));
            
            const restoredInfo = await manager.restoreFromBackup(backupName, restoreOptions);
            
            console.log(chalk.green('✅ Restoration completed successfully!'));
            console.log(chalk.cyan(`📁 Restored from: ${restoredInfo.name}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Restoration failed:'), error.message);
            process.exit(1);
        }
    });

// Comando para eliminar backup
program
    .command('delete')
    .alias('rm')
    .description('Delete a backup')
    .option('-n, --name <name>', 'Backup name to delete')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (options) => {
        try {
            const manager = await initRecoveryManager();
            const backups = manager.listBackups();
            
            if (backups.length === 0) {
                console.log(chalk.yellow('⚠️  No backups available to delete'));
                return;
            }
            
            let backupName = options.name;
            
            // Si no se especifica nombre, mostrar lista para seleccionar
            if (!backupName) {
                const choices = backups.map(backup => ({
                    name: `${backup.name} (${new Date(backup.timestamp).toLocaleString()})`,
                    value: backup.name
                }));
                
                const selection = await inquirer.prompt([{
                    type: 'list',
                    name: 'backup',
                    message: 'Select backup to delete:',
                    choices
                }]);
                
                backupName = selection.backup;
            }
            
            // Verificar que existe
            const selectedBackup = backups.find(b => b.name === backupName);
            if (!selectedBackup) {
                console.log(chalk.red('❌ Backup not found'));
                return;
            }
            
            // Confirmación
            if (!options.force) {
                console.log(chalk.yellow('⚠️  You are about to delete:'));
                console.log(`   📁 Name: ${selectedBackup.name}`);
                console.log(`   📅 Created: ${new Date(selectedBackup.timestamp).toLocaleString()}`);
                console.log(`   💾 Size: ${selectedBackup.stats.file_size_mb} MB`);
                
                const confirm = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Are you sure you want to delete this backup?',
                    default: false
                }]);
                
                if (!confirm.proceed) {
                    console.log(chalk.yellow('⚠️  Deletion cancelled by user'));
                    return;
                }
            }
            
            manager.deleteBackup(backupName);
            console.log(chalk.green(`✅ Backup deleted: ${backupName}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error deleting backup:'), error.message);
        }
    });

// Comando interactivo
program
    .command('interactive')
    .alias('i')
    .description('Interactive recovery management')
    .action(async () => {
        try {
            console.log(chalk.blue('🎮 Interactive Recovery Management'));
            console.log(chalk.gray('Use this mode for guided backup/restore operations\n'));
            
            const manager = await initRecoveryManager();
            
            while (true) {
                const action = await inquirer.prompt([{
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to do?',
                    choices: [
                        { name: '📦 Create Backup', value: 'backup' },
                        { name: '📋 List Backups', value: 'list' },
                        { name: '🔄 Restore Backup', value: 'restore' },
                        { name: '🗑️  Delete Backup', value: 'delete' },
                        { name: '❌ Exit', value: 'exit' }
                    ]
                }]);
                
                if (action.action === 'exit') {
                    break;
                }
                
                switch (action.action) {
                    case 'backup':
                        const backupName = await inquirer.prompt([{
                            type: 'input',
                            name: 'name',
                            message: 'Backup name (leave empty for auto-generated):',
                            default: ''
                        }]);
                        
                        const backupInfo = await manager.createSystemBackup(
                            backupName.name || undefined
                        );
                        console.log(chalk.green(`✅ Backup created: ${backupInfo.name}`));
                        break;
                        
                    case 'list':
                        const backups = manager.listBackups();
                        if (backups.length === 0) {
                            console.log(chalk.yellow('⚠️  No backups found'));
                        } else {
                            console.log(chalk.cyan('\n📦 Available Backups:'));
                            backups.forEach((backup, index) => {
                                console.log(chalk.white(`${index + 1}. ${backup.name}`));
                                console.log(chalk.gray(`   ${new Date(backup.timestamp).toLocaleString()} | ${backup.stats.total_messages} messages`));
                            });
                        }
                        break;
                        
                    // Implementar otros casos...
                }
                
                console.log(''); // Línea en blanco para separación
            }
            
            console.log(chalk.blue('👋 Goodbye!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Interactive mode failed:'), error.message);
        }
    });

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⚠️  Received interrupt signal, closing connections...'));
    if (recoveryManager) {
        await recoveryManager.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n⚠️  Received terminate signal, closing connections...'));
    if (recoveryManager) {
        await recoveryManager.close();
    }
    process.exit(0);
});

program.parse(process.argv);