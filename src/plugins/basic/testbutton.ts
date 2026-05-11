import type { CommandModule } from '../../types/index.js';

const testbuttonCommand: CommandModule = {
    config: {
        name: 'testbutton',
        aliases: ['tb', 'list'],
        description: 'Send an interactive list message',
        usage: '!testbutton',
        category: 'basic',
    },
    handler: async function (context, args: string[]): Promise<void> {
        const jid = context.fromJid;
        const sock = context.socket;

        // await sock.sendMessage(
        //     jid,
        //     {
        //         text: 'This is a list!',
        //         footer: 'Hello World!',
        //         title: 'Amazing boldfaced list title',
        //         buttonText: 'Required, text on the button to view the list',
        //         sections: [
        //             {
        //                 title: 'Section 1',
        //                 rows: [{
        //                     title: 'Option 1',
        //                     rowId: 'option1'
        //                 },
        //                 {
        //                     title: 'Option 2',
        //                     rowId: 'option2',
        //                     description: 'This is a description'
        //                 }]
        //             },
        //             {
        //                 title: 'Section 2',
        //                 rows: [{
        //                     title: 'Option 3',
        //                     rowId: 'option3'
        //                 },
        //                 {
        //                     title: 'Option 4',
        //                     rowId: 'option4',
        //                     description: 'This is a description V2'
        //                 }]
        //             }]
        //     }
        // );

        // await sock.sendMessage(
        //     jid,
        //     {
        //         text: 'This is a button message!',  // image: buffer or // image: { url: url } If you want to use images
        //         caption: 'caption', // Use this if you are using an image or video
        //         footer: 'Hello World!',
        //         buttons: [{
        //             buttonId: 'Id1',
        //             buttonText: {
        //                 displayText: 'Button 1'
        //             }
        //         },
        //         {
        //             buttonId: 'Id2',
        //             buttonText: {
        //                 displayText: 'Button 2'
        //             }
        //         },
        //         {
        //             buttonId: 'Id3',
        //             buttonText: {
        //                 displayText: 'Button 3'
        //             }
        //         }]
        //     }
        // )

        await sock.sendMessage(
            jid,
            {
                text: 'This is an Interactive message!',
                title: 'Hiii',
                subtitle: 'There is a subtitle',
                footer: 'Hello World!',
                interactiveButtons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Click Me!',
                            id: 'your_id'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Follow Me',
                            url: 'https://whatsapp.com/channel/0029Vag9VSI2ZjCocqa2lB1y',
                            merchant_url: 'https://whatsapp.com/channel/0029Vag9VSI2ZjCocqa2lB1y'
                        })
                    },
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Click Me!',
                            copy_code: '1234567890'
                        })
                    },
                    {
                        name: 'cta_call',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Call Me!',
                            phone_number: '628xxx'
                        })
                    },
                    {
                        name: 'cta_catalog',
                        buttonParamsJson: JSON.stringify({
                            business_phone_number: '628xxx'
                        })
                    },
                    {
                        name: 'cta_reminder',
                        buttonParamsJson: JSON.stringify({
                            display_text: '...'
                        })
                    },
                    {
                        name: 'cta_cancel_reminder',
                        buttonParamsJson: JSON.stringify({
                            display_text: '...'
                        })
                    },
                    {
                        name: 'address_message',
                        buttonParamsJson: JSON.stringify({
                            display_text: '...'
                        })
                    },
                    {
                        name: 'send_location',
                        buttonParamsJson: JSON.stringify({
                            display_text: '...'
                        })
                    },
                    {
                        name: 'open_webview',
                        buttonParamsJson: JSON.stringify({
                            title: 'Follow Me!',
                            link: {
                                in_app_webview: true, // or false
                                url: 'https://whatsapp.com/channel/0029Vag9VSI2ZjCocqa2lB1y'
                            }
                        })
                    },
                    {
                        name: 'mpm',
                        buttonParamsJson: JSON.stringify({
                            product_id: '8816262248471474'
                        })
                    },
                    {
                        name: 'wa_payment_transaction_details',
                        buttonParamsJson: JSON.stringify({
                            transaction_id: '12345848'
                        })
                    },
                    {
                        name: 'automated_greeting_message_view_catalog',
                        buttonParamsJson: JSON.stringify({
                            business_phone_number: '628xxx',
                            catalog_product_id: '12345'
                        })
                    },
                    {
                        name: 'galaxy_message',
                        buttonParamsJson: JSON.stringify({
                            mode: 'published',
                            flow_message_version: '3',
                            flow_token: '1:1307913409923914:293680f87029f5a13d1ec5e35e718af3',
                            flow_id: '1307913409923914',
                            flow_cta: 'innovatorssoftn kawaii >\\<',
                            flow_action: 'navigate',
                            flow_action_payload: {
                                screen: 'QUESTION_ONE',
                                params: {
                                    user_id: '123456789',
                                    referral: 'campaign_xyz'
                                }
                            },
                            flow_metadata: {
                                flow_json_version: '201',
                                data_api_protocol: 'v2',
                                flow_name: 'Lead Qualification [en]',
                                data_api_version: 'v2',
                                categories: ['Lead Generation', 'Sales']
                            }
                        })
                    },
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: 'Click Me!',
                            sections: [
                                {
                                    title: 'Title 1',
                                    highlight_label: 'Highlight label 1',
                                    rows: [
                                        {
                                            header: 'Header 1',
                                            title: 'Title 1',
                                            description: 'Description 1',
                                            id: 'Id 1'
                                        },
                                        {
                                            header: 'Header 2',
                                            title: 'Title 2',
                                            description: 'Description 2',
                                            id: 'Id 2'
                                        }
                                    ]
                                }
                            ]
                        })
                    }
                ]
            }
        )
    },
};

export default testbuttonCommand;