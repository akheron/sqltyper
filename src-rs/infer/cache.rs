use crate::infer::error::Error;
use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::{Arc, Mutex};
use tokio::sync::watch::{channel, Receiver, Sender};

#[derive(Debug)]
pub enum Message<T> {
    Initial,
    Done(Arc<T>),
    Error(Error),
}

impl<T> Message<T> {
    fn to_result(&self) -> Result<Arc<T>, Error> {
        match self {
            Message::Initial => panic!("Unexpected Initial state"),
            Message::Done(value) => Ok(value.clone()),
            Message::Error(error) => Err(error.clone()),
        }
    }
}

enum CacheSlot<T> {
    Pending(Receiver<Message<T>>),
    Done(Arc<T>),
}

pub struct Cache<T>(
    /// The key is a table name without schema, value is a Vec of all tables with
    /// that name. If the Vec is empty, no table with this name exists in any schema.
    Mutex<HashMap<String, CacheSlot<T>>>,
);

pub enum Status<T> {
    Fetch(Sender<Message<T>>),
    Pending(Receiver<Message<T>>),
    Done(Arc<T>),
}

impl<T: Debug> Cache<T> {
    pub fn new() -> Cache<T> {
        Cache(Mutex::new(HashMap::new()))
    }

    pub fn status(&self, table_name: &str) -> Status<T> {
        let mut data = self.0.lock().unwrap();
        match data.get(table_name) {
            Some(CacheSlot::Pending(receiver)) => Status::Pending(receiver.clone()),
            Some(CacheSlot::Done(value)) => Status::Done(value.clone()),
            None => {
                let (tx, rx) = channel(Message::Initial);
                data.insert(table_name.into(), CacheSlot::Pending(rx));
                Status::Fetch(tx)
            }
        }
    }

    pub fn insert(&self, notify: Sender<Message<T>>, table_name: &str, tables: T) -> Arc<T> {
        let tables = Arc::new(tables);

        // The receiver is stored in the cache slot before being replaced here by the
        // actual value. Keep the receiver around so that the channel is still open
        // when send() is called below, even if there are no listeners.
        let _receiver = {
            let mut data = self.0.lock().unwrap();
            data.insert(table_name.into(), CacheSlot::Done(tables.clone()))
        };

        notify.send(Message::Done(tables.clone())).unwrap();
        tables
    }

    pub fn error(&self, notify: Sender<Message<T>>, error: Error) {
        notify.send(Message::Error(error)).unwrap();
    }

    pub async fn wait_for(&self, mut receiver: Receiver<Message<T>>) -> Result<Arc<T>, Error> {
        receiver.changed().await.unwrap();
        receiver.borrow().to_result()
    }
}
